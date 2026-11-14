import Foundation
import CryptoKit
import Darwin

struct SharedPdfFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
struct SharedPdfFile: Codable {
    let name: String
    let size: Int
    let local: String
}
struct SharedPdfRecord: Codable {
    let id: String
    let files: [SharedPdfFile]
    let fingerprint: String
    let createdAt: Date
}

/// This source is compiled into both targets. flock serializes the app and extension.
final class SharedPdfInbox {
    static let shared = SharedPdfInbox()
    static let maxBytes = 25 * 1024 * 1024
    static let maxFiles = 5
    static let maxInboxBytes = 50 * 1024 * 1024
    static let changed = Notification.Name("MizanSharedPdfInboxChanged")
    private let fm = FileManager.default

    private func root() throws -> URL {
        let group = Bundle.main.object(forInfoDictionaryKey: "MizanAppGroup") as? String ?? "group.com.faraday.followfinance"
        guard let container = fm.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw SharedPdfFailure(message: "PDF paylaşımı için Mizan uygulama grubu kullanılamıyor.")
        }
        var root = container.appendingPathComponent("shared-pdf-inbox", isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try root.setResourceValues(values)
        return root
    }
    private func locked<T>(_ action: (URL) throws -> T) throws -> T {
        let root = try root()
        let lock = open(root.appendingPathComponent(".lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard lock >= 0 else { throw SharedPdfFailure(message: "PDF kuyruğu okunamadı.") }
        defer { close(lock) }
        guard flock(lock, LOCK_EX) == 0 else { throw SharedPdfFailure(message: "PDF kuyruğu okunamadı.") }
        defer { flock(lock, LOCK_UN) }
        return try action(root)
    }
    private func recordURLs(_ root: URL) throws -> [URL] {
        try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
    private func read(_ url: URL) throws -> SharedPdfRecord {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size < 65536 else { throw SharedPdfFailure(message: "PDF kuyruğu okunamadı.") }
        return try JSONDecoder().decode(SharedPdfRecord.self, from: Data(contentsOf: url))
    }
    private func checkedFile(_ name: String, root: URL) throws -> URL {
        guard name.hasSuffix(".pdf"), UUID(uuidString: String(name.dropLast(4))) != nil else { throw SharedPdfFailure(message: "PDF kuyruğu okunamadı.") }
        let url = root.appendingPathComponent(name)
        guard url.deletingLastPathComponent().standardizedFileURL == root.standardizedFileURL else { throw SharedPdfFailure(message: "PDF kuyruğu okunamadı.") }
        return url
    }
    private func remove(_ record: SharedPdfRecord, root: URL) throws {
        for file in record.files {
            let url = try checkedFile(file.local, root: root)
            if fm.fileExists(atPath: url.path) { try fm.removeItem(at: url) }
        }
        let url = root.appendingPathComponent(record.id + ".json")
        if fm.fileExists(atPath: url.path) { try fm.removeItem(at: url) }
    }
    private func cleanup(_ root: URL) throws {
        let records = try recordURLs(root).map(read).sorted { $0.createdAt < $1.createdAt }
        let expired = records.filter { Date().timeIntervalSince($0.createdAt) > 24 * 60 * 60 }
        for record in expired { try remove(record, root: root) }
        let remaining = try recordURLs(root).map(read)
        let names = Set(remaining.flatMap { $0.files.map(\.local) })
        for url in try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) where url.pathExtension == "pdf" && !names.contains(url.lastPathComponent) { try fm.removeItem(at: url) }
    }
    static func safeName(_ value: String) -> String {
        let cleaned = value.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) || $0 == "/" || $0 == "\\" ? "_" : String($0) }.joined()
        let name = String(cleaned.prefix(160)).trimmingCharacters(in: .whitespacesAndNewlines)
        return name.lowercased().hasSuffix(".pdf") ? name : (name.isEmpty ? "ekstre.pdf" : name + ".pdf")
    }
    /// Streaming validation is shared by the NSItemProvider staging and durable inbox paths.
    static func copyPdf(from source: URL, to destination: URL) throws -> Int {
        guard source.isFileURL else { throw SharedPdfFailure(message: "PDF güvenli bir dosya bağlantısıyla paylaşılmalı.") }
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?
        var result: Result<Int, Error>?
        NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: &coordinationError) { coordinated in
            result = Result { try copyCoordinatedPdf(from: coordinated, to: destination) }
        }
        if let coordinationError { throw coordinationError }
        guard let result else { throw SharedPdfFailure(message: "Paylaşılan PDF okunamadı.") }
        return try result.get()
    }
    private static func copyCoordinatedPdf(from source: URL, to destination: URL) throws -> Int {
        let values = try source.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true else { throw SharedPdfFailure(message: "Yalnızca PDF dosyaları paylaşılabilir.") }
        guard (values.fileSize ?? 0) <= maxBytes else { throw SharedPdfFailure(message: "Paylaşılan PDF 25 MB sınırını aşıyor.") }
        let input = try FileHandle(forReadingFrom: source)
        defer { try? input.close() }
        let header = try input.read(upToCount: 1024) ?? Data()
        let opening = String(data: header, encoding: .isoLatin1) ?? ""
        guard opening.range(of: "%PDF-[0-9]\\.[0-9](?![A-Za-z0-9_])", options: .regularExpression) != nil else { throw SharedPdfFailure(message: "Paylaşılan dosya geçerli bir PDF değil.") }
        guard FileManager.default.createFile(atPath: destination.path, contents: nil, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]) else { throw SharedPdfFailure(message: "PDF kuyruğu oluşturulamadı.") }
        var completed = false
        defer { if !completed { try? FileManager.default.removeItem(at: destination) } }
        let output = try FileHandle(forWritingTo: destination)
        defer { try? output.close() }
        try output.write(contentsOf: header)
        var total = header.count
        while let chunk = try input.read(upToCount: 32768), !chunk.isEmpty {
            total += chunk.count
            guard total <= maxBytes else { throw SharedPdfFailure(message: "Paylaşılan PDF 25 MB sınırını aşıyor.") }
            try output.write(contentsOf: chunk)
        }
        try output.synchronize()
        completed = true
        return total
    }
    func receive(_ sources: [(URL, String)], isCancelled: () -> Bool = { false }) throws {
        try locked { root in
            guard !isCancelled() else { throw SharedPdfFailure(message: "Paylaşım iptal edildi.") }
            try cleanup(root)
            guard !sources.isEmpty && sources.count <= Self.maxFiles else { throw SharedPdfFailure(message: "Tek seferde en fazla 5 PDF paylaşabilirsin.") }
            let records = try recordURLs(root).map(read)
            guard records.count < 10 else { throw SharedPdfFailure(message: "PDF kuyruğu dolu. Bekleyen içe aktarmayı tamamlayıp yeniden dene.") }
            var available = Self.maxInboxBytes - records.flatMap(\.files).reduce(0) { $0 + $1.size }
            var staged = [URL](), files = [SharedPdfFile](), hash = SHA256()
            var committed = false
            defer { if !committed { for file in staged { try? fm.removeItem(at: file) } } }
            for (source, name) in sources {
                guard !isCancelled() else { throw SharedPdfFailure(message: "Paylaşım iptal edildi.") }
                let local = UUID().uuidString.lowercased() + ".pdf"
                let destination = root.appendingPathComponent(local)
                staged.append(destination)
                let size = try Self.copyPdf(from: source, to: destination)
                available -= size
                guard available >= 0 else { throw SharedPdfFailure(message: "PDF kuyruğu dolu. Bekleyen içe aktarmayı tamamlayıp yeniden dene.") }
                let input = try FileHandle(forReadingFrom: destination)
                defer { try? input.close() }
                while let chunk = try input.read(upToCount: 32768), !chunk.isEmpty { hash.update(data: chunk) }
                hash.update(data: Data([0]))
                files.append(SharedPdfFile(name: Self.safeName(name), size: size, local: local))
            }
            let fingerprint = hash.finalize().map { String(format: "%02x", $0) }.joined()
            if records.contains(where: { $0.fingerprint == fingerprint }) { return }
            guard !isCancelled() else { throw SharedPdfFailure(message: "Paylaşım iptal edildi.") }
            let record = SharedPdfRecord(id: UUID().uuidString.lowercased(), files: files, fingerprint: fingerprint, createdAt: Date())
            let data = try JSONEncoder().encode(record)
            let url = root.appendingPathComponent(record.id + ".json")
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            committed = true
        }
        NotificationCenter.default.post(name: Self.changed, object: nil)
    }
    func pending() throws -> [[String: Any]] {
        try locked { root in
            try cleanup(root)
            return try recordURLs(root).map(read).sorted { $0.createdAt < $1.createdAt }.map { record in
                let files: [[String: Any]] = try record.files.map { file in
                    let local = try checkedFile(file.local, root: root)
                    return ["name": file.name, "size": file.size, "uri": local.absoluteString]
                }
                return ["id": record.id, "files": files]
            }
        }
    }
    func acknowledge(_ id: String) throws {
        guard UUID(uuidString: id) != nil else { throw SharedPdfFailure(message: "Geçersiz PDF kimliği.") }
        try locked { root in
            let url = root.appendingPathComponent(id + ".json")
            if fm.fileExists(atPath: url.path) { try remove(read(url), root: root) }
        }
    }
    func clear() throws {
        try locked { root in
            for url in try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) where url.lastPathComponent != ".lock" { try fm.removeItem(at: url) }
        }
    }
}
