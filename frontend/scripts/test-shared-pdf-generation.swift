import Foundation
import Darwin

enum GenerationTestFailure: Error { case failed(String) }

@main
struct GenerationRegression {
    static let fm = FileManager.default
    static func check(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        guard condition() else { throw GenerationTestFailure.failed(message) }
    }
    static func waitFor(_ marker: URL) throws {
        let deadline = Date().addingTimeInterval(10)
        while !fm.fileExists(atPath: marker.path) {
            guard Date() < deadline else { throw GenerationTestFailure.failed("cross-process test timed out") }
            usleep(1000)
        }
    }
    static func child(_ mode: String, root: URL, generation: String) throws {
        if mode == "--stage" {
            let captured = try SharedPdfGeneration.withLock(at: root) { try SharedPdfGeneration.current(at: root) }
            try check(captured == generation, "child did not capture the original generation")
            try Data().write(to: root.appendingPathComponent("staged"))
            try waitFor(root.appendingPathComponent("release-stage"))
            do {
                try SharedPdfGeneration.withLock(at: root) {
                    try SharedPdfGeneration.require(captured, at: root)
                    try Data("old account PDF".utf8).write(to: root.appendingPathComponent("stale.pdf"))
                }
                throw GenerationTestFailure.failed("stale delivery committed after account clear")
            } catch SharedPdfGenerationError.changed { return }
        }
        if mode == "--clear" {
            try Data().write(to: root.appendingPathComponent("clear-attempted"))
            try SharedPdfGeneration.withLock(at: root) {
                try SharedPdfGeneration.rotate(at: root)
                let record = root.appendingPathComponent("committed.pdf")
                if fm.fileExists(atPath: record.path) { try fm.removeItem(at: record) }
                try Data().write(to: root.appendingPathComponent("cleared"))
            }
            return
        }
        throw GenerationTestFailure.failed("unexpected child mode")
    }
    static func process(_ mode: String, root: URL, generation: String) throws -> Process {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
        process.arguments = [mode, root.path, generation]
        try process.run()
        return process
    }
    static func main() throws {
        if CommandLine.arguments.count == 4 {
            try child(CommandLine.arguments[1], root: URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true), generation: CommandLine.arguments[3])
            return
        }
        let root = fm.temporaryDirectory.appendingPathComponent("mizan-generation-test-" + UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }
        let first = try SharedPdfGeneration.withLock(at: root) { try SharedPdfGeneration.current(at: root) }
        let stable = try SharedPdfGeneration.withLock(at: root) { try SharedPdfGeneration.current(at: root) }
        try check(first == stable, "generation changed without clear")

        // A separate extension process stages before clear and attempts commit afterward.
        let staged = try process("--stage", root: root, generation: first)
        try waitFor(root.appendingPathComponent("staged"))
        let second = try SharedPdfGeneration.withLock(at: root) { try SharedPdfGeneration.rotate(at: root) }
        try check(first != second, "clear did not rotate generation")
        try Data().write(to: root.appendingPathComponent("release-stage"))
        staged.waitUntilExit()
        try check(staged.terminationStatus == 0, "stale-process rejection failed")
        try check(!fm.fileExists(atPath: root.appendingPathComponent("stale.pdf").path), "old account PDF survived")

        // If commit wins the lock, a simultaneous clear must wait then delete its PDF.
        var clearing: Process?
        try SharedPdfGeneration.withLock(at: root) {
            try SharedPdfGeneration.require(second, at: root)
            clearing = try process("--clear", root: root, generation: second)
            try waitFor(root.appendingPathComponent("clear-attempted"))
            usleep(50_000)
            try check(!fm.fileExists(atPath: root.appendingPathComponent("cleared").path), "clear bypassed the commit lock")
            try Data("current account PDF".utf8).write(to: root.appendingPathComponent("committed.pdf"))
        }
        clearing?.waitUntilExit()
        try check(clearing?.terminationStatus == 0, "cross-process clear failed")
        try check(!fm.fileExists(atPath: root.appendingPathComponent("committed.pdf").path), "clear failed to remove a committed PDF")
        let third = try SharedPdfGeneration.withLock(at: root) { try SharedPdfGeneration.current(at: root) }
        try check(third != second, "generation was not preserved after clear")
        print("PASS: stable generation; stale extension rejected after clear; flock serializes cross-process commit and clear.")
    }
}
