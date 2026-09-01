import { Loader2 } from 'lucide-react'

interface ProcessingStateProps {
  statusMessage?: string
}

export default function ProcessingState({ statusMessage }: ProcessingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto">
      {/* Modern minimal spinner */}
      <div className="w-12 h-12 rounded-full border-2 border-[#262626] border-t-white animate-spin mb-6 flex items-center justify-center">
        <Loader2 size={16} className="text-neutral-500 opacity-0" />
      </div>

      {/* Dynamic Status Message */}
      <h3 className="text-base font-semibold text-[#ededed] mb-1.5 min-h-[1.5rem]">
        {statusMessage || 'Ekstre işleniyor...'}
      </h3>

      <p className="text-xs text-[#737373]">
        Verileriniz tamamen yerel olarak cihazınızda analiz edilmektedir.
      </p>
    </div>
  )
}
