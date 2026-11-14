import Capacitor
import Foundation
import UIKit

@objc(SharedPdfPlugin)
public final class SharedPdfPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedPdfPlugin"
    public let jsName = "SharedPdf"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]
    private let worker = DispatchQueue(label: "com.faraday.followfinance.shared-pdf")
    private var observers = [NSObjectProtocol]()
    public override func load() {
        for name in [UIApplication.didBecomeActiveNotification, SharedPdfInbox.changed] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.notifyListeners("sharedPdfReceived", data: [:], retainUntilConsumed: true)
            })
        }
    }
    deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) } }
    @objc func listPending(_ call: CAPPluginCall) {
        worker.async {
            do { let deliveries = try SharedPdfInbox.shared.pending(); call.resolve(["deliveries": deliveries]) }
            catch { call.reject("PDF kuyruğu okunamadı.") }
        }
    }
    @objc func acknowledge(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Geçersiz PDF kimliği."); return }
        worker.async {
            do { try SharedPdfInbox.shared.acknowledge(id); call.resolve() }
            catch { call.reject("PDF geçici dosyaları temizlenemedi.") }
        }
    }
    @objc func clear(_ call: CAPPluginCall) {
        worker.async {
            do { try SharedPdfInbox.shared.clear(); call.resolve() }
            catch { call.reject("Paylaşılan PDF dosyaları temizlenemedi.") }
        }
    }
}
