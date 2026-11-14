import { trackProductEvent } from '../platform/analytics'
import { useCallback, useState } from 'react'
import { parseFile, ParseError } from '../ingest/pipeline'
import { uid } from '../core/hash'
import { useStore } from '../store/AppStore'
import type { ImportOutcome, Statement, Transaction } from '../domain/types'
import { assignResultCard, cardMatchesBank } from '../domain/cards'

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
    async (files: File[], cardId?: string) => {
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
          const parsed = await parseFile(file, {
            rules: state.rules,
            useLocalOcr: state.settings.useLocalOcr,
            ocrEndpoint: state.settings.ocrEndpoint,
            onProgress: (message) =>
              setProgress((p) => ({ ...p, message, fileName: file.name })),
          })
          const card = cardId ? state.profile.cards?.find((item) => item.id === cardId) : undefined
          if (cardId && !card) throw new Error('Seçilen kart bulunamadı. Kartını yeniden seç.')
          if (!card && state.profile.cards?.some((item) => cardMatchesBank(item, parsed.bank))) {
            throw new Error('Bu banka için kayıtlı kartın var. Ekstrenin ait olduğu kartı seçip tekrar dene.')
          }
          if (!card && state.statements.some((statement) => statement.cardId && statement.bank === parsed.bank && statement.periodEnd === parsed.periodEnd)) {
            throw new Error('Bu döneme ait ekstre bir karta bağlı. Mükerrer kayıt oluşturmamak için ilgili kartı seç veya önce Kartlarım bölümünden yeniden ekle.')
          }
          const result = card ? assignResultCard(parsed, card) : parsed

          // The same cycle imported again (to recover rows an older build dropped,
          // or after a re-download) is the same statement, not a second one.
          const existing =
            result.periodEnd === null
              ? undefined
              : [...state.statements, ...statements].find(
                  (st) =>
                    st.bank === result.bank &&
                    (card
                      ? st.cardId === card.id || (!st.cardId && (st.accountLabel ?? '') === parsed.accountLabel)
                      : !st.cardId && (st.accountLabel ?? '') === result.accountLabel) &&
                    st.periodEnd === result.periodEnd,
                )

          const statementId = existing?.id ?? uid('st-')
          let added = 0
          let duplicates = 0
          // An old unlinked import keeps its original transaction ids when it
          // is attached to a card. Only this statement's old ids can match;
          // another card's identical purchase must still be added.
          const originalIds = new Set(existing
            ? [...state.transactions, ...collected].filter((tx) => tx.statementId === existing.id).map((tx) => tx.id)
            : [])

          for (let row = 0; row < result.transactions.length; row++) {
            const tx = result.transactions[row]
            if (existingIds.has(tx.id) || (card && originalIds.has(parsed.transactions[row].id))) {
              duplicates++
              continue
            }
            existingIds.add(tx.id)
            collected.push({ ...tx, statementId })
            added++
          }

          const statement: Statement = {
            id: statementId,
            label: result.label,
            fileName: file.name,
            bank: result.bank,
            accountLabel: result.accountLabel,
            ...(card ? { cardId: card.id } : {}),
            transactionCount: (existing?.transactionCount ?? 0) + added,
            skippedCount: result.skipped,
            periodStart: result.periodStart,
            periodEnd: result.periodEnd,
            dueDate: result.dueDate,
            importedAt: existing?.importedAt ?? Date.now(),
            engine: result.engine,
            summary: result.summary,
            reconciliation: result.reconciliation,
            ignored: result.ignored,
          }

          // A brand-new statement that added nothing is a pure repeat and leaves no
          // record; one that already exists is refreshed either way, so its cover
          // summary and reconciliation catch up with what this build can read.
          if (existing) {
            const at = statements.findIndex((st) => st.id === existing.id)
            if (at >= 0) statements[at] = statement
            else statements.push(statement)
          } else if (added > 0) {
            statements.push(statement)
          }
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

      if (collected.length > 0) void trackProductEvent('statement_imported')
      setProgress(IDLE)
      return outcomes
    },
    [dispatch, state.transactions, state.statements, state.profile.cards, state.rules, state.settings],
  )

  return { run, progress }
}
