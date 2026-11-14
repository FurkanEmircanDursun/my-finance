import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MizanBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        receiveDocuments(connectionOptions.urlContexts)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        receiveDocuments(URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    private func receiveDocuments(_ contexts: Set<UIOpenURLContext>) {
        let documents = contexts.map(\.url).filter(\.isFileURL)
        guard !documents.isEmpty else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            do { try SharedPdfInbox.shared.receive(documents.map { ($0, $0.lastPathComponent) }) }
            catch {
                DispatchQueue.main.async {
                    let alert = UIAlertController(title: "PDF alınamadı", message: (error as? SharedPdfFailure)?.message ?? "Paylaşılan PDF okunamadı. Yeniden dene.", preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "Tamam", style: .default))
                    self.window?.rootViewController?.present(alert, animated: true)
                }
            }
        }
    }
}
