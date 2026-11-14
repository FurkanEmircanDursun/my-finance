import UIKit

@main
final class ProbeAppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = ProbeViewController()
        self.window = window
        window.makeKeyAndVisible()
        return true
    }
}

final class ProbeViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let button = UIButton(type: .system)
        button.setTitle("Share synthetic PDF", for: .normal)
        button.accessibilityIdentifier = "shareSyntheticPDF"
        button.addTarget(self, action: #selector(share), for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            button.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    @objc private func share() {
        do {
            // Invented, balanced statement. No bank download or real account data.
            let lines = [
                "AKBANK AXESS HESAP ÖZETİ",
                "Dönem Borcu 100.00 TL",
                "Önceki Dönem Hesap Özeti Bakiyesi 0.00",
                "Ekstre Dönemi 01/09/2026-30/09/2026",
                "Hesap Kesim Tarihi 30/09/2026",
                "Son Ödeme Tarihi 10/10/2026",
                "05/09/2026 CI MARKET 100.00"
            ]
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let fixture = documents.appendingPathComponent("synthetic-share-proof.pdf")
            if !FileManager.default.fileExists(atPath: fixture.path) {
                let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 612, height: 792))
                try renderer.writePDF(to: fixture) { context in
                    context.beginPage()
                    for (index, line) in lines.enumerated() {
                        (line as NSString).draw(at: CGPoint(x: 40, y: 55 + index * 24), withAttributes: [
                            .font: UIFont.systemFont(ofSize: 12), .foregroundColor: UIColor.black
                        ])
                    }
                }
            }
            let activity = UIActivityViewController(activityItems: [fixture], applicationActivities: nil)
            activity.popoverPresentationController?.sourceView = view
            activity.popoverPresentationController?.sourceRect = view.bounds
            present(activity, animated: true)
        } catch {
            let alert = UIAlertController(title: "Synthetic fixture failed", message: String(describing: error), preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Close", style: .default))
            present(alert, animated: true)
        }
    }
}
