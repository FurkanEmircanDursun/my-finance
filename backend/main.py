import io
import re
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pymupdf  # PyMuPDF
from PIL import Image
import numpy as np
from rapidocr_onnxruntime import RapidOCR

app = FastAPI(title="My Finance OCR & Parser Backend (PaddleOCR)")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize RapidOCR (PaddleOCR ONNX engine) once on startup
ocr_engine = RapidOCR()

AKBANK_DATE_RE = re.compile(r"\d{2}/\d{2}/\d{4}")
GARANTI_DATE_RE = re.compile(
    r"\d{2}\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+\d{4}",
    re.IGNORECASE,
)

def extract_text_paddleocr(pdf_bytes: bytes) -> str:
    """Render PDF pages and extract structured text using PaddleOCR (RapidOCR)."""
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    full_lines: List[str] = []

    for page_idx, page in enumerate(doc):
        # 200 DPI gives excellent clarity for small bank statement fonts
        pix = page.get_pixmap(dpi=200)
        img = Image.open(io.BytesIO(pix.tobytes()))
        img_np = np.array(img)

        result, _ = ocr_engine(img_np)
        if not result:
            continue

        # Extract bounding box midpoints to reconstruct lines accurately
        boxes = []
        for box, text, score in result:
            if not text or not text.strip():
                continue
            y_mid = (box[0][1] + box[2][1]) / 2.0
            x_left = box[0][0]
            boxes.append((y_mid, x_left, text.strip(), score))

        # Sort by Y ascending, then X ascending
        boxes.sort(key=lambda b: (b[0], b[1]))

        # Group items that lie on the same visual line (Y tolerance = 10px)
        lines: List[str] = []
        cur_line = []
        cur_y = None

        for y, x, text, score in boxes:
            if cur_y is None or abs(y - cur_y) < 10:
                cur_line.append((x, text))
                if cur_y is None:
                    cur_y = y
            else:
                cur_line.sort(key=lambda item: item[0])
                lines.append(" ".join(item[1] for item in cur_line))
                cur_line = [(x, text)]
                cur_y = y

        if cur_line:
            cur_line.sort(key=lambda item: item[0])
            lines.append(" ".join(item[1] for item in cur_line))

        full_lines.extend(lines)

    return "\n".join(full_lines)

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "engine": "PaddleOCR (RapidOCR ONNX)",
        "version": "1.0.0"
    }

@app.post("/api/ocr")
async def perform_ocr(file: UploadFile = File(...)):
    """Extract text from uploaded PDF statement using PaddleOCR."""
    if not file.filename.lower().endswith(".pdf"):
        content = await file.read()
        return {"text": content.decode("utf-8", errors="ignore"), "engine": "raw_text"}

    try:
        pdf_bytes = await file.read()
        extracted_text = extract_text_paddleocr(pdf_bytes)
        
        garanti_matches = len(GARANTI_DATE_RE.findall(extracted_text))
        akbank_matches = len(AKBANK_DATE_RE.findall(extracted_text))
        bank = "garanti" if garanti_matches > akbank_matches else ("akbank" if akbank_matches > 0 else "unknown")

        return {
            "success": True,
            "bank": bank,
            "engine": "PaddleOCR",
            "text": extracted_text,
            "line_count": len(extracted_text.splitlines())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PaddleOCR error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
