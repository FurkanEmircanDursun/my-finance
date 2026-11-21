package com.faraday.followfinance;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** No provider size/type is trusted; enforce the bound while streaming. */
final class SharedPdfCopy {
    /** Only application-authored copy may cross the native error boundary unchanged. */
    static final class PdfException extends IOException {
        PdfException(String message) { super(message); }
    }
    static final long MAX_BYTES = 25L * 1024 * 1024;
    static final int MAX_FILES = 5;
    static long copy(InputStream input, OutputStream output) throws IOException {
        byte[] header = new byte[1024];
        int offset = 0;
        while (offset < header.length) {
            int read = input.read(header, offset, header.length - offset);
            if (read < 0) break;
            if (read == 0) continue;
            offset += read;
        }
        if (!java.util.regex.Pattern.compile("%PDF-[0-9]\\.[0-9](?![A-Za-z0-9_])").matcher(new String(header, 0, offset, StandardCharsets.ISO_8859_1)).find()) throw new PdfException("Paylaşılan dosya geçerli bir PDF değil.");
        output.write(header, 0, offset);
        long total = offset;
        byte[] buffer = new byte[32768];
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > MAX_BYTES) throw new PdfException("Paylaşılan PDF 25 MB sınırını aşıyor.");
            output.write(buffer, 0, read);
        }
        return total;
    }
    static String safeName(String value) {
        String name = value == null ? "ekstre.pdf" : value.replaceAll("[\\\\/\\p{Cntrl}]", "_").trim();
        if (name.length() > 160) name = name.substring(0, 160);
        if (name.isEmpty()) name = "ekstre.pdf";
        return name.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf") ? name : name + ".pdf";
    }
    private SharedPdfCopy() {}
}
