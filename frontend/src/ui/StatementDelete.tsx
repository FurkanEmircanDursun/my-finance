import { count } from '../core/money'
import { useStore } from '../store/AppStore'
import { useFeedback } from './Feedback'
import { ConfirmDialog } from './Modal'

export function StatementDelete({ statementId, onClose }: { statementId?: string; onClose: () => void }) {
  const { state, getCurrentState, dispatch } = useStore()
  const feedback = useFeedback()
  const statement = state.statements.find(item => item.id === statementId)
  const linkedCount = statement ? state.transactions.filter(item => item.statementId === statement.id).length : 0

  return <ConfirmDialog
    open={Boolean(statement)}
    title="Ekstreyi sil"
    message={`${statement?.label ?? ''} ve ona bağlı ${count(linkedCount)} işlem hesabından silinir. Silme bildiriminden geri alabilirsin.`}
    confirmLabel="Ekstreyi sil"
    destructive
    onCancel={onClose}
    onConfirm={() => {
      const current = getCurrentState()
      const target = current.statements.find(item => item.id === statementId)
      const transactions = current.transactions.filter(item => item.statementId === statementId)
      if (!target || target.label !== statement?.label || transactions.length !== linkedCount) {
        feedback({ message: 'Ekstre değişti. Silmeden önce tekrar kontrol et.' })
        onClose()
        return
      }
      dispatch({ type: 'removeStatement', statementId: target.id })
      if (getCurrentState().statements.some(item => item.id === target.id)) return
      onClose()
      feedback({
        message: `Ekstre ve ${count(transactions.length)} bağlı işlem silindi.`,
        undo: () => {
          const before = getCurrentState()
          dispatch({ type: 'restoreStatement', statement: target, transactions })
          return getCurrentState() !== before
            ? 'Ekstre ve bağlı işlemler geri yüklendi.'
            : 'Ekstre geri yüklenemedi. Arşivdeki mevcut kayıtları kontrol et.'
        },
      })
    }}
  />
}
