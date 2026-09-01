import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, FileText, X, CheckCircle2, AlertCircle,
  Shield, ArrowRight, ChevronLeft
} from 'lucide-react'
import type { UploadedFile } from '../App'
import ProcessingState from '../components/upload/ProcessingState'

interface UploadPageProps {
  isProcessing: boolean
  statusMessage: string
  uploadedFiles: UploadedFile[]
  onAnalyze: (files: File[]) => void
  onReset: () => void
  onBackToDashboard: () => void
}

const BANK_BADGES: Record<string, { label: string; color: string }> = {
  'Garanti BBVA': { label: 'Garanti BBVA', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  'Akbank':       { label: 'Akbank',       color: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

export default function UploadPage({
  isProcessing,
  statusMessage,
  uploadedFiles,
  onAnalyze,
  onBackToDashboard,
}: UploadPageProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [dragError, setDragError] = useState<string | null>(null)

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    setDragError(null)
    if (rejected.length > 0) {
      setDragError('Yalnızca PDF veya TXT dosyaları kabul edilir.')
      return
    }
    const existing = new Set(pendingFiles.map(f => f.name))
    const newFiles = accepted.filter(f => !existing.has(f.name))
    setPendingFiles(prev => [...prev, ...newFiles])
  }, [pendingFiles])

  const removeFile = (name: string) => {
    setPendingFiles(prev => prev.filter(f => f.name !== name))
  }

  const handleAnalyze = () => {
    if (pendingFiles.length > 0) {
      onAnalyze(pendingFiles)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/plain': ['.txt'], 'application/pdf': ['.pdf'] },
    multiple: true,
  })

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0a0a]">
        <ProcessingState statusMessage={statusMessage} />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#0a0a0a] text-[#ededed] p-4 sm:p-6">
      {/* Top minimal bar */}
      <header className="w-full max-w-lg mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#171717] border border-[#262626] flex items-center justify-center text-xs font-semibold text-[#ededed]">
            ₺
          </div>
          <span className="font-semibold text-sm tracking-tight text-[#ededed]">My Finance</span>
        </div>

        {uploadedFiles.length > 0 && (
          <button
            onClick={onBackToDashboard}
            className="btn-secondary text-xs py-1 px-2.5"
          >
            <ChevronLeft size={13} />
            Dashboard'a Dön
          </button>
        )}
      </header>

      {/* Centered Upload Card */}
      <main className="w-full max-w-lg mx-auto my-auto py-6">
        <div className="card space-y-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-[#ededed] tracking-tight">
              Ekstre Yükle
            </h1>
            <p className="text-xs text-[#737373] leading-relaxed">
              Akbank ve Garanti BBVA kredi kartı ekstrenizi (PDF veya TXT) yükleyerek harcamalarınızı analiz edin.
            </p>
          </div>

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`
              relative rounded-xl border border-dashed p-8 text-center cursor-pointer
              transition-all duration-150 flex flex-col items-center justify-center gap-3
              ${isDragActive
                ? 'border-neutral-400 bg-[#171717]'
                : 'border-[#262626] bg-[#0d0d0d] hover:border-[#333333] hover:bg-[#141414]'
              }
            `}
          >
            <input {...getInputProps()} />

            <div className="w-10 h-10 rounded-lg bg-[#171717] border border-[#262626] flex items-center justify-center text-[#737373]">
              <Upload size={18} />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-[#ededed]">
                {isDragActive ? 'Dosyaları buraya bırakın' : 'Dosyaları buraya sürükleyin'}
              </p>
              <p className="text-xs text-[#737373]">
                veya <span className="text-[#ededed] underline underline-offset-2">göz atın</span>
              </p>
            </div>

            {/* Supported Banks info */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[11px] text-[#525252]">Desteklenen:</span>
              <span className="text-[11px] text-[#737373] bg-[#171717] px-2 py-0.5 rounded border border-[#262626]">
                Akbank
              </span>
              <span className="text-[11px] text-[#737373] bg-[#171717] px-2 py-0.5 rounded border border-[#262626]">
                Garanti BBVA
              </span>
            </div>
          </div>

          {/* Error Message */}
          {dragError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle size={14} className="shrink-0" />
              <span>{dragError}</span>
            </div>
          )}

          {/* Pending Files List */}
          {pendingFiles.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-[#737373]">
                <span>Yüklenecek Dosyalar</span>
                <span>{pendingFiles.length} dosya</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {pendingFiles.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#171717] border border-[#262626] text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText size={14} className="text-[#737373] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[#ededed] font-medium truncate">{file.name}</p>
                        <p className="text-[11px] text-[#737373]">{(file.size / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFile(file.name)
                      }}
                      className="p-1 rounded hover:bg-[#262626] text-[#737373] hover:text-[#ededed] transition-colors ml-2"
                      title="Kaldır"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Already Analyzed Files */}
          {uploadedFiles.length > 0 && (
            <div className="pt-2 border-t border-[#1f1f1f] space-y-1.5">
              <span className="text-[11px] text-[#525252] block">Önceden yüklenen ekstreler:</span>
              <div className="flex flex-wrap gap-1.5">
                {uploadedFiles.map((f) => {
                  const badge = BANK_BADGES[f.bank]
                  return (
                    <div
                      key={f.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#171717] border border-[#262626] text-[11px]"
                    >
                      <CheckCircle2 size={11} className="text-emerald-400" />
                      <span className="text-[#ededed]">{f.name}</span>
                      <span className="text-[#737373]">({f.transactionCount})</span>
                      {badge && (
                        <span className={`px-1.5 py-0.2 rounded text-[9px] border ${badge.color}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* CTA Action Button */}
          {pendingFiles.length > 0 && (
            <div className="pt-2">
              <button
                onClick={handleAnalyze}
                className="btn-primary w-full py-2.5"
              >
                <span>{uploadedFiles.length > 0 ? 'Ekleyerek Analiz Et' : 'Analizi Başlat'}</span>
                <ArrowRight size={14} />
              </button>
              {uploadedFiles.length > 0 && (
                <p className="text-[11px] text-center text-[#737373] mt-2">
                  Mevcut veriler korunarak yeni ekstre birleştirilecektir.
                </p>
              )}
            </div>
          )}

          {/* Privacy Note */}
          <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-[#525252]">
            <Shield size={11} />
            <span>Dosyalar yalnızca tarayıcınızda işlenir, hiçbir sunucuya gönderilmez.</span>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full text-center py-2 text-[11px] text-[#404040]">
        My Finance · Sıfır-Bilgi Prensibi
      </footer>
    </div>
  )
}
