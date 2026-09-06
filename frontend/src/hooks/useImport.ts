import { useCallback, useState } from 'react'
import { parseFile, ParseError } from '../ingest/pipeline'
import { uid } from '../core/hash'
import { useStore } from '../store/AppStore'
import type { ImportOutcome, Statement, Transaction } from '../domain/types'
import type { TransactionWithStatement } from '../store/state'

export interface ImportProgress {
  running: boolean
  fileName: string
  message: string
  done: number
  total: number
}

const IDLE: ImportProgress = { running: false, fileName: '', message: '', done: 0, total: 0 }

export function useImport() {
  const { state, dispatch } = useStore()
  const [progress, setProgress] = useState<ImportProgress>(IDLE)

  const run = useCallback(
    async (files: File[]) => {
      if (!files.length) return

      setProgress({ running: true, fileName: files[0].name, message: 'Hazırlanıyor…', done: 0, total: files.length })

      const existingIds = new Set(state.transactions.map((t) => t.id))
      const collected: Transaction[] = []
      const statements: Statement[] = []
      const outcomes: ImportOutcome[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProgress({ running: true, fileName: file.name, message: 'Okunuyor…', done: i, total: files.length })

        try {
          const result = await parseFile(file, {
            rules: state.rules,
            useLocalOcr: state.settings.useLocalOcr,
            ocrEndpoint: state.settings.ocrEndpoint,
            onProgress: (message) =>
              setProgress((p) => ({ ...p, message, fileName: file.name })),
          })

          const statementId = uid('st-')
          let added = 0
          let duplicates = 0

          for (const tx of result.transactions) {
            if (existingIds.has(tx.id)) {
              duplicates++
              continue
            }
            existingIds.add(tx.id)
            collected.push({ ...tx, statementId } as TransactionWithStatement)
            added++
          }

          const statement: Statement = {
            id: statementId,
            label: result.label,
            fileName: file.name,
            bank: result.bank,
            transactionCount: added,
            skippedCount: result.skipped,
            periodStart: result.periodStart,
            periodEnd: result.periodEnd,
            dueDate: result.dueDate,
            importedAt: Date.now(),
            engine: result.engine,
          }

          if (added > 0) statements.push(statement)
          outcomes.push({ fileName: file.name, ok: true, added, duplicates, statement })
        } catch (error) {
          const message =
            error instanceof ParseError
              ? [error.message, error.hint].filter(Boolean).join(' ')
              : error instanceof Error
                ? error.message
                : 'Bilinmeyen hata'
          outcomes.push({ fileName: file.name, ok: false, added: 0, duplicates: 0, error: message })
        }
      }

      if (collected.length || outcomes.length) {
        dispatch({ type: 'import', transactions: collected, statements, outcomes })
      }

      setProgress(IDLE)
      return outcomes
    },
    [dispatch, state.transactions, state.rules, state.settings],
  )

  return { run, progress }
}
