import Capacitor

final class MizanBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharedPdfPlugin())
    }
}
