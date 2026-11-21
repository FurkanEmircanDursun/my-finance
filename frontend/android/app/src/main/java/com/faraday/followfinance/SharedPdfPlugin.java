package com.faraday.followfinance;

import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Private, expiring inbox. URI grants are consumed immediately, never persisted or exposed to JS. */
@CapacitorPlugin(name = "SharedPdf")
public class SharedPdfPlugin extends Plugin {
    private static final long TTL_MS = 24L * 60 * 60 * 1000;
    private static final long MAX_INBOX_BYTES = 50L * 1024 * 1024;
    // Serialize across Activity/bridge recreation so an old copy cannot race cleanup.
    private static final ExecutorService INBOX_WORKER = Executors.newSingleThreadExecutor();
    private File inbox() throws IOException {
        File dir = new File(getContext().getFilesDir(), "shared-pdf-inbox");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new SharedPdfCopy.PdfException("PDF kuyruğu oluşturulamadı.");
        return dir;
    }
    @Override protected void handleOnNewIntent(Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action) && !Intent.ACTION_VIEW.equals(action)) return;
        LinkedHashSet<Uri> uris = new LinkedHashSet<>();
        try {
            if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) uris.add(intent.getData());
            if (Intent.ACTION_SEND.equals(action)) {
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (uri != null) uris.add(uri);
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (streams != null) uris.addAll(streams);
            }
            ClipData clips = intent.getClipData();
            if (uris.isEmpty() && clips != null) for (int i = 0; i < clips.getItemCount(); i++) if (clips.getItemAt(i).getUri() != null) uris.add(clips.getItemAt(i).getUri());
        } catch (RuntimeException invalid) { persistError("Paylaşılan PDF bağlantısı okunamadı."); return; }
        // Avoid replay on activity recreation. File ownership moves into our inbox below.
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.setClipData(null);
        intent.setData(null);
        final String mime = intent.getType();
        INBOX_WORKER.execute(() -> receive(new ArrayList<>(uris), mime));
    }
    @Override protected void handleOnResume() { signal(); }
    private void signal() { notifyListeners("sharedPdfReceived", new JSObject(), true); }
    @PluginMethod public void listPending(PluginCall call) {
        INBOX_WORKER.execute(() -> {
            try {
                cleanup();
                JSArray deliveries = new JSArray();
                for (File record : records()) {
                    JSONObject json = new JSONObject(readRecord(record));
                    JSONArray files = json.optJSONArray("files");
                    if (files != null) for (int i = 0; i < files.length(); i++) {
                        JSONObject file = files.getJSONObject(i);
                        File local = checkedFile(file.getString("local"));
                        file.put("uri", Uri.fromFile(local).toString());
                        file.remove("local");
                    }
                    deliveries.put(json);
                }
                JSObject result = new JSObject(); result.put("deliveries", deliveries); call.resolve(result);
            } catch (Exception error) { call.reject("PDF kuyruğu okunamadı."); }
        });
    }
    @PluginMethod public void acknowledge(PluginCall call) {
        String id = call.getString("id", "");
        if (!id.matches("[a-f0-9-]{36}")) { call.reject("Geçersiz PDF kimliği."); return; }
        INBOX_WORKER.execute(() -> {
            try { deleteRecord(new File(inbox(), id + ".json")); call.resolve(); }
            catch (Exception error) { call.reject("PDF geçici dosyaları temizlenemedi."); }
        });
    }
    @PluginMethod public void clear(PluginCall call) {
        INBOX_WORKER.execute(() -> {
            try { File[] files = inbox().listFiles(); if (files != null) for (File file : files) deleteFile(file); call.resolve(); }
            catch (Exception error) { call.reject("Paylaşılan PDF dosyaları temizlenemedi."); }
        });
    }
    private void receive(List<Uri> uris, String mime) {
        List<File> staged = new ArrayList<>();
        try {
            cleanup();
            if (uris.isEmpty() || uris.size() > SharedPdfCopy.MAX_FILES) throw new SharedPdfCopy.PdfException("Tek seferde en fazla 5 PDF paylaşabilirsin.");
            if (mime != null && !mime.equals("application/pdf") && !mime.equals("application/octet-stream") && !mime.equals("*/*")) throw new SharedPdfCopy.PdfException("Yalnızca PDF dosyaları paylaşılabilir.");
            JSONArray files = new JSONArray();
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long available = MAX_INBOX_BYTES - inboxBytes();
            for (Uri uri : uris) {
                if (uri == null || !"content".equals(uri.getScheme())) throw new SharedPdfCopy.PdfException("PDF güvenli bir dosya bağlantısıyla paylaşılmalı.");
                String type = getContext().getContentResolver().getType(uri);
                if (type != null && !type.equals("application/pdf") && !type.equals("application/octet-stream")) throw new SharedPdfCopy.PdfException("Yalnızca PDF dosyaları paylaşılabilir.");
                String name = "ekstre.pdf";
                try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (nameIndex >= 0) name = SharedPdfCopy.safeName(cursor.getString(nameIndex));
                        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex) && cursor.getLong(sizeIndex) > SharedPdfCopy.MAX_BYTES) throw new SharedPdfCopy.PdfException("Paylaşılan PDF 25 MB sınırını aşıyor.");
                    }
                }
                File local = new File(inbox(), UUID.randomUUID() + ".pdf");
                staged.add(local);
                long size;
                try (InputStream input = getContext().getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(local)) {
                    if (input == null) throw new SharedPdfCopy.PdfException("Paylaşılan PDF okunamadı.");
                    size = SharedPdfCopy.copy(input, output);
                    output.getFD().sync();
                }
                available -= size;
                if (available < 0) throw new SharedPdfCopy.PdfException("PDF kuyruğu dolu. Bekleyen içe aktarmayı tamamlayıp yeniden dene.");
                try (InputStream input = new FileInputStream(local)) { byte[] buffer = new byte[32768]; int read; while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read); }
                digest.update((byte) 0);
                JSONObject descriptor = new JSONObject(); descriptor.put("name", name); descriptor.put("size", size); descriptor.put("local", local.getName()); files.put(descriptor);
            }
            String fingerprint = hex(digest.digest());
            for (File record : records()) if (fingerprint.equals(new JSONObject(readRecord(record)).optString("fingerprint"))) {
                for (File file : staged) deleteFile(file); signal(); return;
            }
            int pending = 0;
            for (File record : records()) if (new JSONObject(readRecord(record)).has("files")) pending++;
            if (pending >= 10) throw new SharedPdfCopy.PdfException("PDF kuyruğu dolu. Bekleyen içe aktarmayı tamamlayıp yeniden dene.");
            JSONObject record = new JSONObject(); record.put("id", UUID.randomUUID().toString()); record.put("files", files); record.put("fingerprint", fingerprint);
            writeRecord(record); signal();
        } catch (Exception error) {
            for (File file : staged) file.delete();
            writeError(error instanceof SharedPdfCopy.PdfException ? error.getMessage() : "Paylaşılan PDF alınamadı. Dosya iznini kontrol edip yeniden dene.");
        }
    }
    private String hex(byte[] bytes) { StringBuilder result = new StringBuilder(); for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255)); return result.toString(); }
    private File checkedFile(String name) throws IOException {
        if (!name.matches("[a-f0-9-]{36}\\.pdf")) throw new SharedPdfCopy.PdfException("Geçersiz PDF dosyası.");
        File file = new File(inbox(), name);
        if (!file.getCanonicalFile().getParentFile().equals(inbox().getCanonicalFile())) throw new SharedPdfCopy.PdfException("Geçersiz PDF yolu.");
        return file;
    }
    private File[] records() throws IOException {
        File[] records = inbox().listFiles((dir, name) -> name.matches("[a-f0-9-]{36}\\.json"));
        if (records == null) return new File[0];
        Arrays.sort(records, Comparator.comparingLong(File::lastModified)); return records;
    }
    private long inboxBytes() throws IOException { long total = 0; File[] all = inbox().listFiles(); if (all != null) for (File file : all) total += file.length(); return total; }
    private void writeRecord(JSONObject record) throws Exception {
        File temporary = new File(inbox(), record.getString("id") + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) { output.write(record.toString().getBytes(StandardCharsets.UTF_8)); output.getFD().sync(); }
        if (!temporary.renameTo(new File(inbox(), record.getString("id") + ".json"))) { temporary.delete(); throw new SharedPdfCopy.PdfException("PDF kuyruğu kaydedilemedi."); }
    }
    private void persistError(String message) { INBOX_WORKER.execute(() -> writeError(message)); }
    private void writeError(String message) {
        try {
            // Retain one current error without ever evicting an unacknowledged PDF.
            for (File previous : records()) if (new JSONObject(readRecord(previous)).has("error")) deleteRecord(previous);
            JSONObject record = new JSONObject(); record.put("id", UUID.randomUUID().toString()); record.put("error", message); writeRecord(record); signal();
        } catch (Exception ignored) { /* Private storage is unavailable; never expose provider details. */ }
    }
    private static String readRecord(File record) throws IOException {
        try (FileInputStream input = new FileInputStream(record); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int read;
            while ((read = input.read(buffer)) != -1) { if (output.size() + read > 65536) throw new SharedPdfCopy.PdfException("Geçersiz PDF kaydı."); output.write(buffer, 0, read); }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
    private static void deleteFile(File file) throws IOException { if (file.exists() && !file.delete()) throw new SharedPdfCopy.PdfException("PDF dosyası temizlenemedi."); }
    private void deleteRecord(File record) throws Exception {
        if (!record.exists()) return;
        JSONArray files = new JSONObject(readRecord(record)).optJSONArray("files");
        if (files != null) for (int i = 0; i < files.length(); i++) deleteFile(checkedFile(files.getJSONObject(i).getString("local")));
        deleteFile(record);
    }
    private void cleanup() throws Exception {
        File[] records = records(); long now = System.currentTimeMillis();
        for (File record : records) if (now - record.lastModified() > TTL_MS) deleteRecord(record);
        LinkedHashSet<String> referenced = new LinkedHashSet<>();
        for (File record : records()) { JSONArray files = new JSONObject(readRecord(record)).optJSONArray("files"); if (files != null) for (int i = 0; i < files.length(); i++) referenced.add(files.getJSONObject(i).getString("local")); }
        File[] all = inbox().listFiles();
        if (all != null) for (File file : all) if (!file.getName().endsWith(".json") && !referenced.contains(file.getName())) deleteFile(file);
    }
}
