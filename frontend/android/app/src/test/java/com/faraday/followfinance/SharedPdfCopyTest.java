package com.faraday.followfinance;

import static org.junit.Assert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class SharedPdfCopyTest {
    @Test public void validPdfIsCopiedWithoutModification() throws Exception {
        byte[] bytes = "%PDF-1.7\nstatement".getBytes(StandardCharsets.US_ASCII);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertEquals(bytes.length, SharedPdfCopy.copy(new ByteArrayInputStream(bytes), output));
        assertArrayEquals(bytes, output.toByteArray());
    }
    @Test public void spoofedOrEmptyPdfIsRejectedBeforeWriting() throws Exception {
        for (String invalid : new String[] { "", "%PDF", "<html>financial data" }) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try { SharedPdfCopy.copy(new ByteArrayInputStream(invalid.getBytes(StandardCharsets.US_ASCII)), output); fail("invalid content accepted"); }
            catch (IOException expected) { assertEquals(0, output.size()); }
        }
    }
    @Test public void providerCannotBypassBoundByOmittingSize() throws Exception {
        InputStream input = new InputStream() {
            long count = 0;
            @Override public int read() { if (count >= SharedPdfCopy.MAX_BYTES + 1) return -1; int value = count < 9 ? "%PDF-1.7\n".charAt((int) count) : 'x'; count++; return value; }
        };
        OutputStream sink = new OutputStream() { @Override public void write(int value) {} @Override public void write(byte[] bytes, int off, int len) {} };
        try { SharedPdfCopy.copy(input, sink); fail("oversized provider accepted"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("25 MB")); }
    }
    @Test public void pathAndControlCharactersCannotEscapeInboxName() {
        assertEquals(".._.._bank_statement.pdf", SharedPdfCopy.safeName("../../bank\nstatement.pdf"));
        assertEquals("ekstre.pdf", SharedPdfCopy.safeName(null));
        assertEquals("receipt.pdf", SharedPdfCopy.safeName("receipt"));
    }
    @Test public void acceptsPdfPreambleWithinFirst1024BytesAndRejectsHeaderAfterLimit() throws Exception {
        String preamble = "\ufeffbank export\n%PDF-1.7\nstatement";
        byte[] valid = preamble.getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        SharedPdfCopy.copy(new ByteArrayInputStream(valid), output);
        assertArrayEquals(valid, output.toByteArray());
        byte[] outside = (new String(new char[1024]).replace('\0', 'x') + "%PDF-1.7\n").getBytes(StandardCharsets.US_ASCII);
        try { SharedPdfCopy.copy(new ByteArrayInputStream(outside), new ByteArrayOutputStream()); fail("header outside prefix accepted"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("PDF")); }
    }
    @Test public void providerFailuresAreNotMarkedAsSafeProductMessages() throws Exception {
        InputStream provider = new InputStream() { @Override public int read() throws IOException { throw new IOException("content://private-bank/account-secret"); } };
        try { SharedPdfCopy.copy(provider, new ByteArrayOutputStream()); fail("provider failure ignored"); }
        catch (IOException failure) { assertFalse(failure instanceof SharedPdfCopy.PdfException); }
        try { SharedPdfCopy.copy(new ByteArrayInputStream("not a PDF".getBytes(StandardCharsets.US_ASCII)), new ByteArrayOutputStream()); fail("invalid content accepted"); }
        catch (IOException failure) { assertTrue(failure instanceof SharedPdfCopy.PdfException); }
    }
}
