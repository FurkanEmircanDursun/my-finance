import { useCallback } from 'react'
import { useStore } from '../store/AppStore'
import type { Transaction } from '../domain/types'
import { useFeedback } from './Feedback'
import { hapticTap } from '../platform/haptics'

/** Restore the original row, including its statement/card identity, on Undo. */
export function useTransactionDelete() {
  const { dispatch } = useStore()
  const feedback = useFeedback()
  return useCallback((transaction: Transaction) => {
    dispatch({ type: 'deleteTransactions', ids: [transaction.id] })
    hapticTap()
    feedback({
      message: `${transaction.kind === 'income' ? 'Gelir' : 'Kayıt'} silindi.`,
      undo: () => dispatch({ type: 'addManualBatch', transactions: [transaction] }),
    })
  }, [dispatch, feedback])
}
