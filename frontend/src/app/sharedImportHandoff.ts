import type { SharedPdfDelivery } from '../platform/sharedPdf'

/** Native files remain pending until the user closes a handled import. */
export class SharedImportHandoff {
  private disposed = false
  private pending: { id: string; promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } | null = null

  constructor(private readonly show: (delivery: SharedPdfDelivery | null) => void) {}

  receive(delivery: SharedPdfDelivery): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Import session ended'))
    if (this.pending?.id === delivery.id) return this.pending.promise
    if (this.pending) return Promise.reject(new Error('An import is already being reviewed'))
    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed })
    this.pending = { id: delivery.id, promise, resolve, reject }
    this.show(delivery)
    return promise
  }

  complete(id: string): void {
    if (this.disposed || this.pending?.id !== id) return
    const pending = this.pending
    this.pending = null
    this.show(null)
    pending.resolve()
  }

  dispose(): void {
    this.disposed = true
    this.pending?.reject(new Error('Import session ended'))
    this.pending = null
  }
}
