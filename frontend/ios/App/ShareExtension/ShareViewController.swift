import UIKit
import UniformTypeIdentifiers

/// Receives only PDF attachments; all provider URLs are copied within their callback lifetime.
final class ShareViewController: UIViewController {
    private let status = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)
    private let done = UIButton(type: .system)
    private let worker = DispatchQueue(label: "com.faraday.followfinance.share-extension")
    private var staging: URL?
    private var generation: String?
    private let operation = Progress(totalUnitCount: 1)
    private var cancelled: Bool { operation.isCancelled }
    private var started = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let title = UILabel(); title.text = "Mizan’a Gönder"; title.font = .preferredFont(forTextStyle: .title2); title.textAlignment = .center
        status.text = "PDF’ler hazırlanıyor…"; status.numberOfLines = 0; status.textAlignment = .center; status.font = .preferredFont(forTextStyle: .body)
        done.setTitle("Vazgeç", for: .normal); done.addTarget(self, action: #selector(finish), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [title, spinner, status, done]); stack.axis = .vertical; stack.spacing = 24; stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 28), stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -28), stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        spinner.startAnimating()
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }; started = true
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        guard !providers.isEmpty, providers.count <= SharedPdfInbox.maxFiles, providers.allSatisfy({ $0.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) }) else { show("Tek seferde en fazla 5 PDF paylaşabilirsin.", success: false); return }
        do { generation = try SharedPdfInbox.shared.currentGeneration() }
        catch { show("PDF paylaşımı için Mizan uygulama grubu kullanılamıyor.", success: false); return }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]); staging = folder }
        catch { show("Paylaşılan PDF alınamadı. Yeniden dene.", success: false); return }
        stage(providers, index: 0, sources: [], bytes: 0, folder: folder)
    }
    private func stage(_ providers: [NSItemProvider], index: Int, sources: [(URL, String)], bytes: Int, folder: URL) {
        guard !cancelled else { cleanup(); return }
        guard index < providers.count else {
            guard let generation else { show("Paylaşılan PDF alınamadı. Yeniden dene.", success: false); return }
            done.isEnabled = false
            status.text = "PDF’ler kaydediliyor…"
            worker.async { [weak self] in
                guard let self, !self.cancelled else { return }
                do { try SharedPdfInbox.shared.receive(sources, expectedGeneration: generation, isCancelled: { self.cancelled }); DispatchQueue.main.async { self.cleanup(); self.show("PDF’ler Mizan’a hazır. Mizan’ı açtığında içe aktarma başlayacak.", success: true) } }
                catch { DispatchQueue.main.async { self.cleanup(); self.show((error as? SharedPdfFailure)?.message ?? "Paylaşılan PDF alınamadı. Yeniden dene.", success: false) } }
            }
            return
        }
        providers[index].loadFileRepresentation(forTypeIdentifier: UTType.pdf.identifier) { [weak self] url, error in
            guard let self else { return }
            guard !self.cancelled, error == nil, let url else { DispatchQueue.main.async { self.cleanup(); self.show("Paylaşılan PDF okunamadı. Yeniden dene.", success: false) }; return }
            do {
                let destination = folder.appendingPathComponent(UUID().uuidString + ".pdf")
                let size = try SharedPdfInbox.copyPdf(from: url, to: destination)
                guard bytes + size <= SharedPdfInbox.maxInboxBytes else { throw SharedPdfFailure(message: "PDF’lerin toplam boyutu 50 MB sınırını aşıyor.") }
                let name = providers[index].suggestedName ?? url.lastPathComponent
                DispatchQueue.main.async { self.stage(providers, index: index + 1, sources: sources + [(destination, name)], bytes: bytes + size, folder: folder) }
            } catch { DispatchQueue.main.async { self.cleanup(); self.show((error as? SharedPdfFailure)?.message ?? "Paylaşılan PDF alınamadı. Yeniden dene.", success: false) } }
        }
    }
    private func show(_ message: String, success: Bool) {
        guard !cancelled else { return }
        spinner.stopAnimating(); status.text = message; done.isEnabled = true; done.setTitle(success ? "Bitti" : "Kapat", for: .normal)
    }
    private func cleanup() { if let staging { try? FileManager.default.removeItem(at: staging) }; staging = nil }
    @objc private func finish() {
        guard done.isEnabled else { return }
        operation.cancel()
        cleanup()
        extensionContext?.completeRequest(returningItems: nil)
    }
}
