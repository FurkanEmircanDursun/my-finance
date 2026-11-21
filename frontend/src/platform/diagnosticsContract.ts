export const DIAGNOSTICS_PATH = '/diagnostics.html'
export const DIAGNOSTIC_TRACES = ['screen_render', 'statement_parse', 'quote_refresh', 'update_check', 'backup_export'] as const
export type DiagnosticTrace = typeof DIAGNOSTIC_TRACES[number]
export interface DiagnosticSample { name: DiagnosticTrace; durationMs: number }
export interface DiagnosticConfig { apiKey: string; projectId: string; appId: string }
export type DiagnosticEnvelope = { channel: string; type: 'init'; payload: DiagnosticConfig } | { channel: string; type: 'sample'; payload: DiagnosticSample }

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)))
}
export function isDiagnosticSample(value: unknown): value is DiagnosticSample {
  return exactKeys(value, ['name', 'durationMs']) && DIAGNOSTIC_TRACES.includes(value.name as DiagnosticTrace) && typeof value.durationMs === 'number' && Number.isFinite(value.durationMs) && value.durationMs > 0 && value.durationMs <= 600_000
}
export function isDiagnosticConfig(value: unknown): value is DiagnosticConfig {
  return exactKeys(value, ['apiKey', 'projectId', 'appId']) && Object.values(value).every(item => typeof item === 'string' && item.length > 0 && item.length <= 256)
}
export function isDiagnosticEnvelope(value: unknown): value is DiagnosticEnvelope {
  return exactKeys(value, ['channel', 'type', 'payload']) && typeof value.channel === 'string' && value.channel.length > 0 && value.channel.length <= 50 && (value.type === 'init' ? isDiagnosticConfig(value.payload) : value.type === 'sample' && isDiagnosticSample(value.payload))
}
/** The SDK serializes its own window URL; this document must never have app routes. */
export function isFixedDiagnosticsDocument(value: string): boolean {
  try {
    const url = new URL(value)
    return ['https:', 'http:', 'capacitor:'].includes(url.protocol) && url.pathname === DIAGNOSTICS_PATH && !url.search && !url.hash && !url.username && !url.password
  } catch { return false }
}
