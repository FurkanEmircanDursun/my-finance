import Capacitor
import WebKit

final class MizanBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        webView?.allowsBackForwardNavigationGestures = true
        bridge?.registerPluginInstance(SharedPdfPlugin())
        bridge?.registerPluginInstance(MizanNavigationGesturesPlugin())
    }
}

@objc(MizanNavigationGesturesPlugin)
final class MizanNavigationGesturesPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "MizanNavigationGesturesPlugin"
    let jsName = "MizanNavigationGestures"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setOverlayOpen", returnType: CAPPluginReturnPromise)
    ]

    @objc func setOverlayOpen(_ call: CAPPluginCall) {
        guard let open = call.getBool("open") else {
            call.reject("Missing overlay state")
            return
        }
        DispatchQueue.main.async {
            // Sheet dismissal stays with the sheet. WKWebView swipes navigate
            // page history again as soon as the last sheet closes.
            self.bridge?.webView?.allowsBackForwardNavigationGestures = !open
            call.resolve()
        }
    }
}
