import Foundation
import Darwin

enum SharedPdfGenerationError: Error { case unavailable, changed }

/// This file is also compiled by the Mac CI cross-process regression test.
enum SharedPdfGeneration {
    static let fileName = ".generation"
    static func withLock<T>(at directory: URL, _ action: () throws -> T) throws -> T {
        let descriptor = open(directory.appendingPathComponent(".lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw SharedPdfGenerationError.unavailable }
        defer { close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw SharedPdfGenerationError.unavailable }
        defer { flock(descriptor, LOCK_UN) }
        return try action()
    }
    /// Caller holds withLock; the generation file survives every inbox clear.
    static func current(at directory: URL) throws -> String {
        let file = directory.appendingPathComponent(fileName)
        if FileManager.default.fileExists(atPath: file.path) {
            let bytes = try Data(contentsOf: file)
            guard bytes.count <= 64, let value = String(data: bytes, encoding: .utf8), UUID(uuidString: value) != nil else { throw SharedPdfGenerationError.unavailable }
            return value
        }
        return try rotate(at: directory)
    }
    /// Caller holds withLock, including while clearing the old PDF records.
    @discardableResult static func rotate(at directory: URL) throws -> String {
        let value = UUID().uuidString.lowercased()
        let bytes = Data(value.utf8)
        let file = directory.appendingPathComponent(fileName)
        #if os(iOS)
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try bytes.write(to: file, options: .atomic)
        #endif
        let handle = try FileHandle(forWritingTo: file)
        defer { try? handle.close() }
        try handle.synchronize()
        return value
    }
    static func require(_ expected: String, at directory: URL) throws {
        guard try current(at: directory) == expected else { throw SharedPdfGenerationError.changed }
    }
}
