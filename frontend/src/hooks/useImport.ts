import { trackProductEvent } from '../platform/analytics'
import { measureOperation } from '../platform/diagnostics'
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseFile, ParseError } from '../ingest/pipeline'
import { StatementValidationError } from '../ingest/validation'
import { UserFacingError } from '../core/errors'
import { uid } from '../core/hash'
import { useStore } from '../store/AppStore'
import type { CreditCard, ImportOutcome, Statement, Transaction } from '../domain/types'
import { assignResultCard } from '../domain/cards'
import { legacyCardKey, resolveImportCard } from '../domain/cardLifecycle'

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
  const lifetime = useRef(0)
  const runningFor = useRef<number | null>(null)
  useEffect(() => () => { lifetime.current++ }, [])

  const run = useCallback(
    async (files: File[], cardId?: string, newCard = false) => {
      const session = lifetime.current
      if (!files.length || runningFor.current === session) return
      runningFor.current = session

      setProgress({ running: true, fileName: files[0].name, message: 'Hazırlanıyor…', done: 0, total: files.length })

      const workingRows = new Map(state.transactions.map((tx) => [tx.id, tx]))
      const collected = new Map<string, Transaction>()
      const refreshed = new Set<string>()
      const statements: Statement[] = []
      const outcomes: ImportOutcome[] = []
      const reservations = new Map<string, CreditCard>()

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProgress({ running: true, fileName: file.name, message: 'Okunuyor…', done: i, total: files.length })

        try {
          const parsed = await measureOperation('statement_parse', () => parseFile(file, {
            rules: state.rules,
            useLocalOcr: state.settings.useLocalOcr,
            ocrEndpoint: state.settings.ocrEndpoint,
            onProgress: (message) => {
              if (session === lifetime.current) setProgress((p) => ({ ...p, message, fileName: file.name }))
            },
          }))
          if (session !== lifetime.current) return
          if (parsed.reconciliation.status === 'mismatch' || (parsed.bank !== 'CSV' && parsed.skipped > 0)) {
            throw new ParseError('Ekstrede okunan işlemler doğrulanamadı. Bankadan indirdiğin özgün PDF ile yeniden dene.')
          }
          const card = resolveImportCard(parsed, { selectedId: cardId, newCard,
            cards: state.profile.cards ?? [], statements: [...state.statements, ...statements], reservations })
          const result = card ? assignResultCard(parsed, card) : parsed

          // The same cycle imported again (to recover rows an older build dropped,
          // or after a re-download) is the same statement, not a second one.
          const existing =
            result.periodEnd === null
              ? undefined
              : [...statements, ...state.statements].find(
                  (st) =>
                    st.bank === result.bank &&
                    (!newCard && card
                      ? st.cardId === card.id || (!st.cardId && (st.accountLabel ?? '') === parsed.accountLabel
                        && (!cardId || card.id === legacyCardKey(st.bank, st.accountLabel ?? st.bank)))
                      : card ? st.cardId === card.id : !st.cardId && (st.accountLabel ?? '') === result.accountLabel) &&
                    st.periodEnd === result.periodEnd,
                )

          const statementId = existing?.id ?? uid('st-')
          let added = 0
          let duplicates = 0
          // An old unlinked import keeps its original transaction ids when it
          // is attached to a card. Only this statement's old ids can match;
          // another card's identical purchase must still be added.
          const previousRows = existing
            ? [...workingRows.values()].filter((tx) => tx.statementId === existing.id)
            : []
          const originalIds = new Map(previousRows.map((tx) => [tx.id, tx]))
          const verified = result.reconciliation.status === 'match'
          if (!verified && existing?.reconciliation?.status === 'match') {
            throw new ParseError('Mevcut ekstreyi güncellemek için dönem borcu ve önceki bakiyesi okunabilen bir dosya yükle.')
          }

          // The bank-verified set supersedes the old read of this cycle. A
          // unique raw line also carries edits across an amount/sign correction.
          const priorByLine = new Map<string, Transaction | null>()
          for (const tx of previousRows) {
            if (tx.raw) priorByLine.set(tx.raw, priorByLine.has(tx.raw) ? null : tx)
          }
          const planned: Transaction[] = []
          for (let row = 0; row < result.transactions.length; row++) {
            const tx = result.transactions[row]
            const prior = originalIds.get(tx.id) ?? (card ? originalIds.get(parsed.transactions[row].id) : undefined)
            if (prior || workingRows.has(tx.id)) {
              duplicates++
              if (!verified) continue
              if (!prior) {
                throw new ParseError('Bu ekstredeki bir işlem başka bir döneme bağlı. Arşivde ilgili ekstreleri kontrol et.')
              }
            } else {
              added++
            }

            const previousCategory = prior ?? (tx.raw ? priorByLine.get(tx.raw) : undefined)
            planned.push({
              ...tx,
              id: prior?.id ?? tx.id,
              statementId,
              ...(previousCategory?.categoryLocked ? { category: previousCategory.category, categoryLocked: true } : {}),
            })
          }

          if (verified && existing) {
            refreshed.add(statementId)
            for (const tx of previousRows) {
              workingRows.delete(tx.id)
              collected.delete(tx.id)
            }
          }
          for (const tx of planned) {
            workingRows.set(tx.id, tx)
            collected.set(tx.id, tx)
          }

          const statement: Statement = {
            id: statementId,
            label: result.label,
            fileName: file.name,
            bank: result.bank,
            accountLabel: result.accountLabel,
            ...(card ? { cardId: card.id } : {}),
            transactionCount: verified ? planned.length : (existing?.transactionCount ?? 0) + added,
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

          // The parser accepts zero-row documents only with explicit, balanced
          // no-activity evidence. Their cover still proves this cycle was uploaded.
          if (existing) {
            const at = statements.findIndex((st) => st.id === existing.id)
            if (at >= 0) statements[at] = statement
            else statements.push(statement)
          } else if (added > 0 || result.transactions.length === 0) {
            statements.push(statement)
          }
          const removed = verified ? previousRows.length - duplicates : 0
          outcomes.push({ fileName: file.name, ok: true, added, duplicates, ...(removed > 0 ? { removed } : {}), statement })
        } catch (error) {
          if (session !== lifetime.current) return
          const message =
            error instanceof ParseError || error instanceof StatementValidationError
              ? [error.message, error.hint].filter(Boolean).join(' ')
              : error instanceof UserFacingError
                ? error.message
                : 'Dosya eklenemedi. Bankandan özgün ekstre PDF’sini indirip yeniden dene.'
          outcomes.push({ fileName: file.name, ok: false, added: 0, duplicates: 0, error: message })
        }
      }

      if (session !== lifetime.current) return
      if (collected.size || outcomes.length) {
        dispatch({ type: 'import', transactions: [...collected.values()], statements, outcomes, refreshedStatementIds: [...refreshed] })
      }

      if (outcomes.some(outcome => outcome.added > 0)) void trackProductEvent('statement_imported')
      runningFor.current = null
      setProgress(IDLE)
      return outcomes
    },
    [dispatch, state.transactions, state.statements, state.profile.cards, state.rules, state.settings],
  )

  return { run, progress }
}
