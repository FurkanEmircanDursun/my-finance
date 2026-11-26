import { trackProductEvent } from '../platform/analytics'
import { measureOperation } from '../platform/diagnostics'
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseFile, ParseError, statementImportProblem } from '../ingest/pipeline'
import { StatementValidationError, isPdfFile, MAX_STATEMENT_BYTES } from '../ingest/validation'
import { assessStatementWarnings, findOwnershipMismatch } from '../ingest/ownership'
import { UserFacingError } from '../core/errors'
import { uid } from '../core/hash'
import { useStore } from '../store/AppStore'
import { storageAvailable } from '../firebase/available'
import {
  classifyFailedStatementUpload,
  failedStatementUploadEnabled,
  uploadFailedStatement,
} from '../firebase/failedStatements'
import type { CreditCard, ImportErrorCode, ImportOutcome, ParseResult, Statement, Transaction } from '../domain/types'
import { assignResultCard } from '../domain/cards'
import { legacyCardKey, resolveImportCard } from '../domain/cardLifecycle'

function classifyImportError(error: unknown): ImportErrorCode | undefined {
  if (error instanceof StatementValidationError) {
    if (error.code === 'unsupported_bank') return 'unsupported_bank'
    if (
      error.code === 'unreadable_text' ||
      error.code === 'unreadable_pdf' ||
      error.code === 'invalid_pdf' ||
      error.code === 'password_required'
    ) {
      return 'unreadable'
    }
    return 'other'
  }
  if (error instanceof ParseError) {
    if (/uyuşmuyor|önceki bakiyesi|okunamayan işlem/i.test(error.message)) return 'reconciliation'
    if (/döneme ait ekstre var/i.test(error.message)) return 'duplicate_cycle'
    return 'other'
  }
  return undefined
}

export interface ImportProgress {
  running: boolean
  fileName: string
  message: string
  done: number
  total: number
}

const IDLE: ImportProgress = { running: false, fileName: '', message: '', done: 0, total: 0 }
type ReviewImport = (outcomes: readonly ImportOutcome[]) => Promise<boolean>

export function useImport() {
  const { state, getCurrentState, dispatch, ensureHistory, historyReady, authUser } = useStore()
  const [progress, setProgress] = useState<ImportProgress>(IDLE)
  const lifetime = useRef(0)
  const runningFor = useRef<number | null>(null)
  useEffect(() => () => { lifetime.current++ }, [])

  const run = useCallback(
    async (files: File[], cardId?: string, newCard = false, repairStatementId?: string, review?: ReviewImport) => {
      const session = lifetime.current
      if (!files.length || runningFor.current === session) return
      runningFor.current = session

      setProgress({ running: true, fileName: files[0].name, message: 'Hazırlanıyor…', done: 0, total: files.length })

      let importState = getCurrentState?.() ?? state
      let workingRows: Map<string, Transaction> | undefined
      const collected = new Map<string, Transaction>()
      const refreshed = new Set<string>()
      const statements: Statement[] = []
      const outcomes: ImportOutcome[] = []
      const reservations = new Map<string, CreditCard>()
      const reviewedCardNumbers = new Map<string, string>()
      const batchCardholders: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProgress({ running: true, fileName: file.name, message: 'Okunuyor…', done: i, total: files.length })
        let pdfSha256: string | undefined
        let failedParsed: ParseResult | undefined
        let failureStage: 'parse' | 'post-parse' = 'parse'

        try {
          if (repairStatementId && !isPdfFile(file)) throw new ParseError('Ekstreyi düzeltmek için bankanın özgün PDF dosyasını seç.')
          if (typeof file.type === 'string' && isPdfFile(file) && file.size > 0 && file.size <= MAX_STATEMENT_BYTES && globalThis.crypto?.subtle) {
            const bytes = await file.arrayBuffer()
            const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
            if (session !== lifetime.current) return
            pdfSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
            // A statement replaced earlier in this batch supersedes its saved fingerprint.
            const superseded = new Set(statements.map(statement => statement.id))
            const duplicateInBatch = statements.find(statement => statement.pdfSha256 === pdfSha256)
            const duplicateInStore = importState.statements.find(statement => statement.id !== repairStatementId &&
              !superseded.has(statement.id) && statement.pdfSha256 === pdfSha256)
            const duplicateMatch = duplicateInBatch ?? duplicateInStore
            if (duplicateMatch) {
              outcomes.push({
                fileName: file.name,
                ok: true,
                added: 0,
                duplicates: 0,
                alreadyImported: true,
                existingMatchLabel: duplicateMatch.label,
              })
              continue
            }
          }
          const parsed = await measureOperation('statement_parse', () => parseFile(file, {
            rules: importState.rules,
            useLocalOcr: importState.settings.useLocalOcr,
            ocrEndpoint: importState.settings.ocrEndpoint,
            onProgress: (message) => {
              if (session === lifetime.current) setProgress((p) => ({ ...p, message, fileName: file.name }))
            },
          }))
          if (session !== lifetime.current) return
          failedParsed = parsed
          const problem = statementImportProblem(parsed, isPdfFile(file))
          if (problem) throw problem
          failureStage = 'post-parse'

          if (!workingRows) {
            if (ensureHistory && !historyReady) {
              setProgress(p => ({ ...p, message: 'Ekstre geçmişi kontrol ediliyor…' }))
              importState = await ensureHistory()
              if (session !== lifetime.current) return
              const duplicateAfterSync = pdfSha256
                ? importState.statements.find(statement =>
                    statement.id !== repairStatementId && statement.pdfSha256 === pdfSha256)
                : undefined
              if (duplicateAfterSync) {
                outcomes.push({
                  fileName: file.name,
                  ok: true,
                  added: 0,
                  duplicates: 0,
                  alreadyImported: true,
                  existingMatchLabel: duplicateAfterSync.label,
                })
                continue
              }
            }
            workingRows = new Map(importState.transactions.map(tx => [tx.id, tx]))
          }
          const knownStatements = [...statements, ...importState.statements]

          // Check statement ownership against signed-in account, prior statements, and current batch.
          // Interactive imports surface a typed-name confirmation gate in the review step;
          // headless/non-interactive calls without a review handler still refuse foreign statements.
          const existingCardholders = importState.statements
            .map((st) => st.cardholderName)
            .filter((name): name is string => Boolean(name))
          const ownershipMismatch = findOwnershipMismatch({
            cardholderName: parsed.cardholderName,
            accountDisplayName: authUser?.displayName,
            existingCardholders,
            batchCardholders,
          })
          if (ownershipMismatch && !review) {
            outcomes.push({
              fileName: file.name,
              ok: false,
              added: 0,
              duplicates: 0,
              error: ownershipMismatch.detail,
              errorCode: 'different_holder',
              ...(parsed.cardholderName ? { cardholderName: parsed.cardholderName } : {}),
            })
            continue
          }

          const pdfStatementId = pdfSha256 ? `st-pdf-${pdfSha256}` : undefined
          const interruptedRow = pdfStatementId && !knownStatements.some(statement => statement.id === pdfStatementId)
            ? [...workingRows.values()].find(tx => tx.statementId === pdfStatementId && tx.cardId)
            : undefined
          const interruptedCard = interruptedRow?.cardId
            ? { id: interruptedRow.cardId, name: interruptedRow.accountLabel ?? parsed.accountLabel }
            : undefined
          const card = resolveImportCard(parsed, { selectedId: cardId, newCard, interruptedCard,
            cards: importState.profile.cards ?? [], statements: knownStatements, reservations,
            claimedLast4ByCardId: reviewedCardNumbers })
          const result = card ? assignResultCard(parsed, card) : parsed
          const reportedCardLast4 = result.reportedCardLast4
          const priorSuffix = card && reviewedCardNumbers.get(card.id)
          if (priorSuffix && reportedCardLast4 && priorSuffix !== reportedCardLast4) {
            throw new ParseError('Aynı karta farklı kart numaralarıyla ekstre eklenemez. Bu dosyayı ayrı aktar.')
          }

          // A matching cycle identifies the target of an explicit repair.
          const existing =
            result.periodEnd === null
              ? undefined
              : knownStatements.find(
                  (st) =>
                    st.bank === result.bank &&
                    (!newCard && card
                      ? st.cardId === card.id || (!st.cardId && (st.accountLabel ?? '') === parsed.accountLabel
                        && (!cardId || card.id === legacyCardKey(st.bank, st.accountLabel ?? st.bank)))
                      : card ? st.cardId === card.id : !st.cardId && (st.accountLabel ?? '') === result.accountLabel) &&
                    st.periodEnd === result.periodEnd,
                )

          const statementId = existing?.id ?? pdfStatementId ?? uid('st-')
          if (repairStatementId && existing?.id !== repairStatementId) {
            throw new ParseError('Bu dosya, düzeltmek istediğin ekstreyle eşleşmiyor.')
          }
          if (existing && isPdfFile(file) && (!repairStatementId || statements.some(item => item.id === existing.id))) {
            throw new ParseError('Bu kart ve döneme ait ekstre var. Güncellemek için ekstre detayından PDF ile düzelt seçeneğini kullan.')
          }
          let added = 0
          let duplicates = 0
          const previousRows = existing || pdfStatementId
            ? [...workingRows.values()].filter((tx) => tx.statementId === statementId)
            : []
          const originalIds = new Map(previousRows.map((tx) => [tx.id, tx]))
          const verified = result.reconciliation.status === 'match'
          if (!verified && existing?.reconciliation?.status === 'match') {
            throw new ParseError('Mevcut ekstreyi güncellemek için dönem borcu ve önceki bakiyesi okunabilen bir dosya yükle.')
          }

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

          if (verified && (existing || previousRows.length > 0)) {
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

          const sameBankCardCount = (importState.profile.cards ?? []).filter(
            (saved) => saved.bank === card?.bank,
          ).length
          const warnings = assessStatementWarnings({
            cardholderName: result.cardholderName,
            accountDisplayName: authUser?.displayName,
            existingCardholders,
            batchCardholders,
            periodEnd: result.periodEnd,
            reportedCardLast4,
            sameBankCardCount,
          })

          const statement: Statement = {
            id: statementId,
            label: result.label,
            fileName: file.name,
            ...(pdfSha256 ? { pdfSha256 } : {}),
            ...(result.cardholderName ? { cardholderName: result.cardholderName } : {}),
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

          if (existing) {
            const at = statements.findIndex((st) => st.id === existing.id)
            if (at >= 0) statements[at] = statement
            else statements.push(statement)
          } else if (added > 0 || previousRows.length > 0 || result.transactions.length === 0) {
            statements.push(statement)
          }
          const removed = verified ? previousRows.length - duplicates : 0
          if (statements.includes(statement)) {
            if (result.cardholderName) batchCardholders.push(result.cardholderName)
            if (card && reportedCardLast4) reviewedCardNumbers.set(card.id, reportedCardLast4)
            outcomes.push({
              fileName: file.name,
              ok: true,
              added,
              duplicates,
              ...(removed > 0 ? { removed } : {}),
              ...(reportedCardLast4 ? { reportedCardLast4 } : {}),
              ...(result.cardholderName ? { cardholderName: result.cardholderName } : {}),
              ...(warnings.length ? { warnings } : {}),
              statement,
            })
          } else {
            outcomes.push({ fileName: file.name, ok: true, added, duplicates, alreadyImported: true })
          }
        } catch (error) {
          if (session !== lifetime.current) return
          const message =
            error instanceof ParseError || error instanceof StatementValidationError
              ? [error.message, error.hint].filter(Boolean).join(' ')
              : error instanceof UserFacingError
                ? error.message
                : 'Dosya eklenemedi. Bankandan özgün ekstre PDF’sini indirip yeniden dene.'
          const errorCode = classifyImportError(error)
          let diagnosticReport: ImportOutcome['diagnosticReport']
          const classification = classifyFailedStatementUpload(error, failedParsed, failureStage)
          if (
            classification &&
            authUser?.uid &&
            !authUser.isAnonymous &&
            storageAvailable &&
            failedStatementUploadEnabled()
          ) {
            diagnosticReport =
              (await uploadFailedStatement({
                uid: authUser.uid,
                file,
                sha256: pdfSha256,
                classification,
                userMessage: message,
                parsed: failedParsed,
              })) ?? undefined
            if (session !== lifetime.current) return
          }
          outcomes.push({
            fileName: file.name,
            ok: false,
            added: 0,
            duplicates: 0,
            error: message,
            ...(errorCode ? { errorCode } : {}),
            ...(diagnosticReport ? { diagnosticReport } : {}),
          })
        }
      }

      if (session !== lifetime.current) return
      if (review && statements.length) {
        const approved = await review(outcomes)
        if (session !== lifetime.current) return
        if (!approved) {
          runningFor.current = null
          setProgress(IDLE)
          return
        }
      }

      // The printed digits are only needed during review.
      for (const outcome of outcomes) delete outcome.reportedCardLast4

      const current = getCurrentState?.()
      if (statements.length && current && (current.transactions !== importState.transactions ||
          current.statements !== importState.statements || current.profile.cards !== importState.profile.cards ||
          current.profile.archivedCards !== importState.profile.archivedCards)) {
        runningFor.current = null
        setProgress(IDLE)
        return outcomes.map(outcome => outcome.statement ? {
          fileName: outcome.fileName, ok: false, added: 0, duplicates: 0,
          error: 'Ekstreler veya kartlar işlem sırasında değişti. Dosyayı yeniden incele.',
        } : outcome)
      }

      if (collected.size || outcomes.length) {
        dispatch({ type: 'import', transactions: [...collected.values()], statements, outcomes, refreshedStatementIds: [...refreshed] })
      }

      if (outcomes.some(outcome => outcome.added > 0)) void trackProductEvent('statement_imported')
      runningFor.current = null
      setProgress(IDLE)
      return outcomes
    },
    [authUser?.displayName, authUser?.isAnonymous, authUser?.uid, dispatch, ensureHistory, getCurrentState, historyReady, state],
  )

  return { run, progress }
}
