"""
Local OCR sidecar for My Finance.

Scope is deliberately narrow: turn a scanned PDF into text and hand it back.
All parsing, categorisation and analysis happen in the browser, so this service
never sees a categorised transaction and stores nothing on disk.

Design notes
------------
* The OCR model is loaded lazily on first use. Importing this module used to
  block for several seconds building the engine even when the endpoint was
  never called, and it crashed the whole process when the optional dependency
  was missing rather than degrading to a clear error response.
* Results are cached by content hash. Re-uploading the same statement — which
  happens constantly while iterating on the frontend — returns instantly.
* Pages are rendered and recognised one at a time and released immediately, so
  memory stays flat on long statements.
* CORS is restricted to local development origins. This service handles
  financial documents; it should not be reachable from an arbitrary web page.
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger("my-finance.ocr")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ── Configuration ─────────────────────────────────────────────────────────────

RENDER_DPI = int(os.environ.get("MYFINANCE_OCR_DPI", "200"))
MAX_PAGES = int(os.environ.get("MYFINANCE_OCR_MAX_PAGES", "40"))
MAX_UPLOAD_BYTES = int(os.environ.get("MYFINANCE_MAX_UPLOAD_MB", "25")) * 1024 * 1024
CACHE_SIZE = int(os.environ.get("MYFINANCE_OCR_CACHE", "8"))
PORT = int(os.environ.get("MYFINANCE_PORT", "8005"))

ALLOWED_ORIGINS = [
    "http://localhost:3003",
    "http://127.0.0.1:3003",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]

# Line-grouping tolerance as a fraction of the rendered page height. Bank
# statements set body text around 8pt; at 200 DPI that is ~22px, so 1% of a
# 2200px page groups a row without merging the row beneath it.
LINE_TOLERANCE_RATIO = 0.006

AKBANK_DATE_RE = re.compile(r"\d{2}/\d{2}/\d{4}")
GARANTI_DATE_RE = re.compile(
    r"\d{2}\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+\d{4}",
    re.IGNORECASE,
)

app = FastAPI(
    title="My Finance OCR sidecar",
    version="2.0.0",
    description="Scanned-statement text extraction for the My Finance browser app.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Engine ────────────────────────────────────────────────────────────────────


@dataclass
class EngineState:
    engine: object | None = None
    error: str | None = None
    load_seconds: float = 0.0


_state = EngineState()


def get_engine():
    """Load the OCR engine once, on first use, and remember any failure."""
    if _state.engine is not None:
        return _state.engine
    if _state.error is not None:
        raise HTTPException(status_code=503, detail=_state.error)

    started = time.perf_counter()
    try:
        from rapidocr_onnxruntime import RapidOCR  # imported lazily on purpose

        _state.engine = RapidOCR()
        _state.load_seconds = time.perf_counter() - started
        logger.info("OCR engine ready in %.1fs", _state.load_seconds)
        return _state.engine
    except ImportError as exc:
        _state.error = (
            "OCR bağımlılıkları kurulu değil. `pip install -r backend/requirements.txt` çalıştırın. "
            f"({exc})"
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the client verbatim
        _state.error = f"OCR motoru başlatılamadı: {exc}"

    raise HTTPException(status_code=503, detail=_state.error)


# ── Text reconstruction ───────────────────────────────────────────────────────


def group_into_lines(
    boxes: Iterable[Tuple[float, float, str]], tolerance: float
) -> List[str]:
    """
    Rebuild visual lines from (y, x, text) triples.

    Sorting by y then x is not enough on its own: two cells on the same printed
    row can differ by a pixel or two, so a fresh line is only started once the
    vertical gap exceeds `tolerance`.
    """
    ordered = sorted(boxes, key=lambda b: (b[0], b[1]))
    lines: List[str] = []
    current: List[Tuple[float, str]] = []
    baseline: Optional[float] = None

    for y, x, text in ordered:
        if baseline is None or abs(y - baseline) <= tolerance:
            current.append((x, text))
            if baseline is None:
                baseline = y
        else:
            current.sort(key=lambda item: item[0])
            lines.append(" ".join(item[1] for item in current))
            current = [(x, text)]
            baseline = y

    if current:
        current.sort(key=lambda item: item[0])
        lines.append(" ".join(item[1] for item in current))

    return lines


def extract_text(pdf_bytes: bytes) -> Tuple[str, int]:
    """Render each page, OCR it, and return the reconstructed text."""
    import numpy as np
    import pymupdf
    from PIL import Image

    document = pymupdf.open(stream=pdf_bytes, filetype="pdf")

    try:
        page_count = document.page_count
        if page_count > MAX_PAGES:
            raise HTTPException(status_code=413, detail=f"PDF {MAX_PAGES} sayfa sınırını aşıyor.")

        engine = get_engine()
        all_lines: List[str] = []

        for index in range(page_count):
            page = document.load_page(index)
            pixmap = page.get_pixmap(dpi=RENDER_DPI)
            tolerance = pixmap.height * LINE_TOLERANCE_RATIO

            with Image.open(io.BytesIO(pixmap.tobytes("png"))) as image:
                array = np.array(image.convert("RGB"))

            del pixmap

            result, _ = engine(array)
            del array

            if not result:
                continue

            boxes = []
            for box, text, _score in result:
                cleaned = (text or "").strip()
                if not cleaned:
                    continue
                y_mid = (box[0][1] + box[2][1]) / 2.0
                boxes.append((y_mid, box[0][0], cleaned))

            all_lines.extend(group_into_lines(boxes, tolerance))

        return "\n".join(all_lines), page_count
    finally:
        document.close()


def guess_bank(text: str) -> str:
    garanti = len(GARANTI_DATE_RE.findall(text))
    akbank = len(AKBANK_DATE_RE.findall(text))
    if garanti and garanti >= akbank:
        return "garanti"
    if akbank:
        return "akbank"
    return "unknown"


# ── Cache ─────────────────────────────────────────────────────────────────────

_cache: "OrderedDict[str, Tuple[str, int]]" = OrderedDict()


def cache_get(key: str) -> Optional[Tuple[str, int]]:
    if key not in _cache:
        return None
    _cache.move_to_end(key)
    return _cache[key]


def cache_put(key: str, value: Tuple[str, int]) -> None:
    _cache[key] = value
    _cache.move_to_end(key)
    while len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)


# ── API ───────────────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    engine_loaded: bool
    engine_error: Optional[str] = None
    dpi: int
    max_pages: int
    cached_documents: int
    version: str


class OcrResponse(BaseModel):
    success: bool
    engine: str
    bank: str
    text: str
    line_count: int
    page_count: int
    cached: bool
    elapsed_seconds: float


async def read_upload(file: UploadFile = File(...)) -> Tuple[str, bytes]:
    """Read the upload with a size ceiling so a stray file cannot exhaust memory."""
    payload = await file.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Dosya {MAX_UPLOAD_BYTES // (1024 * 1024)} MB sınırını aşıyor.",
        )
    if not payload:
        raise HTTPException(status_code=400, detail="Dosya boş.")
    return file.filename or "upload", payload


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        engine_loaded=_state.engine is not None,
        engine_error=_state.error,
        dpi=RENDER_DPI,
        max_pages=MAX_PAGES,
        cached_documents=len(_cache),
        version=app.version,
    )


@app.post("/api/ocr", response_model=OcrResponse)
async def ocr(upload: Tuple[str, bytes] = Depends(read_upload)) -> OcrResponse:
    filename, payload = upload
    started = time.perf_counter()

    # Non-PDF uploads are already text; decode and return without touching OCR.
    if not filename.lower().endswith(".pdf"):
        text = payload.decode("utf-8", errors="replace")
        return OcrResponse(
            success=True,
            engine="raw_text",
            bank=guess_bank(text),
            text=text,
            line_count=len(text.splitlines()),
            page_count=0,
            cached=False,
            elapsed_seconds=round(time.perf_counter() - started, 3),
        )

    digest = hashlib.sha256(payload).hexdigest()
    cached = cache_get(digest)

    if cached is not None:
        text, page_count = cached
        was_cached = True
    else:
        try:
            text, page_count = extract_text(payload)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("OCR failed for %s", filename)
            raise HTTPException(status_code=500, detail=f"OCR hatası: {exc}") from exc

        cache_put(digest, (text, page_count))
        was_cached = False

    return OcrResponse(
        success=True,
        engine="RapidOCR (ONNX)",
        bank=guess_bank(text),
        text=text,
        line_count=len(text.splitlines()),
        page_count=page_count,
        cached=was_cached,
        elapsed_seconds=round(time.perf_counter() - started, 3),
    )


@app.post("/api/cache/clear")
def clear_cache() -> dict:
    count = len(_cache)
    _cache.clear()
    return {"cleared": count}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT)
