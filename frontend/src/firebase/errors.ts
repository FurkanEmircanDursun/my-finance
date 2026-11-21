import { UserFacingError } from '../core/errors'

export type FirebaseErrorContext = 'auth' | 'sync' | 'storage' | 'session' | 'notification' | 'general'

const FALLBACKS: Record<FirebaseErrorContext, string> = {
  auth: 'Hesap işlemi tamamlanamadı. Yeniden dene veya farklı bir giriş yöntemi kullan.',
  sync: 'Eşitleme tamamlanamadı. Kayıtların bu cihazda duruyor; yeniden dene.',
  storage: 'Dosya işlemi tamamlanamadı. Yeniden dene.',
  session: 'Oturum işlemi tamamlanamadı. Kayıtların korunuyor; yeniden dene.',
  notification: 'Bildirimler ayarlanamadı. Bağlantını ve bildirim izinlerini kontrol et.',
  general: 'İşlem tamamlanamadı. Yeniden dene.',
}

const AUTH_MESSAGES: Record<string, string> = {
  'email-already-in-use': 'Bu e-posta zaten kayıtlı. Şifren doğruysa giriş yap.',
  'credential-already-in-use': 'Bu hesap başka bir oturuma bağlı. Giriş yapmayı dene.',
  'account-exists-with-different-credential': 'Bu e-posta başka bir yöntemle kayıtlı. O yöntemle giriş yap; Google hesabını sonra bağlayabilirsin.',
  'invalid-email': 'E-posta adresini kontrol et.',
  'invalid-credential': 'E-posta veya şifre hatalı.',
  'wrong-password': 'E-posta veya şifre hatalı.',
  'missing-password': 'Şifreni yaz.',
  'user-not-found': 'E-posta veya şifre hatalı.',
  'user-disabled': 'Bu hesap devre dışı bırakılmış. Destek için uygulama geliştiricisine ulaş.',
  'weak-password': 'Şifre en az 6 karakter olmalı.',
  'password-does-not-meet-requirements': 'Şifren güvenlik koşullarını karşılamıyor. Daha güçlü bir şifre seç.',
  'popup-closed-by-user': 'Google girişi iptal edildi. Hazır olduğunda yeniden deneyebilirsin.',
  'cancelled-popup-request': 'Google girişi iptal edildi. Hazır olduğunda yeniden deneyebilirsin.',
  'popup-blocked': 'Tarayıcı giriş penceresini engelledi. Açılır pencerelere izin verip yeniden dene.',
  'requires-recent-login': 'Bu işlem için kimliğini yeniden doğrula, ardından işlemi tekrar dene.',
  'configuration-not-found': 'Hesap bağlantısı bu sürümde kullanılamıyor. Daha sonra yeniden dene veya farklı bir giriş yöntemi kullan.',
  'operation-not-allowed': 'Bu giriş yöntemi şu an kullanılamıyor. Farklı bir giriş yöntemi dene.',
  'unauthorized-domain': 'Bu adresten giriş yapılamıyor. Mizan’ın resmi adresini kullan.',
  'invalid-action-code': 'Bu bağlantı geçersiz veya daha önce kullanılmış. Yeni bir bağlantı iste.',
  'expired-action-code': 'Bu bağlantının süresi dolmuş. Yeni bir bağlantı iste.',
}

/** Never read a raw SDK message into UI copy, including unknown SDK codes. */
export function firebaseErrorMessage(error: unknown, context: FirebaseErrorContext = 'general'): string {
  if (error instanceof UserFacingError) return error.message
  const value = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
  const code = typeof value === 'string' ? value.toLowerCase().replace(/^firebase\//, '') : ''
  const name = code.includes('/') ? code.slice(code.indexOf('/') + 1) : code
  if (['unauthenticated', 'user-token-expired', 'id-token-expired', 'invalid-user-token', 'session-cookie-expired', 'invalid-session-cookie'].includes(name)) {
    return 'Oturum süren doldu. Hesabına yeniden giriş yapıp işlemi tekrar dene.'
  }
  if (['permission-denied', 'unauthorized'].includes(name)) {
    return 'Bu işlem için yetkin yok. Doğru hesapla giriş yaptığını kontrol et; sorun sürerse yeniden giriş yap.'
  }
  if (['network-request-failed', 'network-error', 'unavailable', 'retry-limit-exceeded', 'deadline-exceeded'].includes(name)) {
    return context === 'sync'
      ? 'Eşitleme servisine ulaşılamadı. İnternet bağlantını kontrol et; kayıtların bu cihazda duruyor.'
      : 'İnternet bağlantısı veya servis erişimi kesildi. Bağlantını kontrol edip yeniden dene.'
  }
  if (['too-many-requests', 'quota-exceeded', 'resource-exhausted'].includes(name)) {
    return 'Servis şu an çok yoğun. Biraz bekleyip yeniden dene; kayıtların korunuyor.'
  }
  if (['object-not-found', 'not-found'].includes(name)) return 'İstenen kayıt veya dosya artık bulunamıyor. Listeyi yenileyip yeniden dene.'
  if (['cancelled', 'canceled'].includes(name)) return 'İşlem iptal edildi. Hazır olduğunda yeniden deneyebilirsin.'
  if (['invalid-checksum', 'server-file-wrong-size'].includes(name)) return 'Dosya aktarımı tamamlanamadı. Dosyayı yeniden seçip tekrar dene.'
  if (code.startsWith('auth/') && AUTH_MESSAGES[name]) return AUTH_MESSAGES[name]
  return FALLBACKS[context]
}
