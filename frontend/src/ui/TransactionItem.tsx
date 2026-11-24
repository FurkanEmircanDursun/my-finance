import { ArrowDownLeft, Banknote, CreditCard, Trash2 } from 'lucide-react'
import { fullDayLabel } from '../core/date'
import { money2 } from '../core/money'
import { categoryColor, categoryLabel } from '../domain/categories'
import { effectiveDate, type Transaction } from '../domain/types'
import './transaction-item.css'

export interface TransactionItemProps {
  transaction: Transaction
  onOpen?: () => void
  onDelete?: () => void
  expanded?: boolean
}

/** High-craft ledger row with category accent dot, tabular signed currency, and independent delete. */
export function TransactionItem({ transaction: tx, onOpen, onDelete, expanded }: TransactionItemProps) {
  const incoming = tx.kind === 'income' || tx.kind === 'refund'
  const label =
    tx.kind === 'income'
      ? 'Gelir'
      : tx.kind === 'payment'
        ? 'Kart borcu ödemesi'
        : categoryLabel(tx.category)
  const dotColor = tx.kind === 'income' ? 'var(--positive)' : categoryColor(tx.category)

  const content = (
    <>
      <span
        className={`transaction-item__icon ${incoming ? 'is-income' : ''}`}
        aria-hidden="true"
      >
        {incoming ? (
          <ArrowDownLeft size={17} />
        ) : tx.source === 'manual' ? (
          <Banknote size={17} />
        ) : (
          <CreditCard size={17} />
        )}
        {!incoming && (
          <span
            className="transaction-item__dot"
            style={{ background: dotColor }}
          />
        )}
      </span>
      <span className="transaction-item__copy">
        <strong title={tx.description}>{tx.description}</strong>
        <small>
          {fullDayLabel(effectiveDate(tx))} · {label}
          {tx.kind === 'refund' ? ' · İade' : ''}
          {tx.installment ? ` · taksit ${tx.installment.current}/${tx.installment.total}` : ''}
        </small>
      </span>
      <strong className={`transaction-item__amount num ${incoming ? 'is-income' : ''}`}>
        {tx.kind === 'expense' ? '−' : incoming ? '+' : ''}
        {money2(tx.amount)}
      </strong>
    </>
  )

  return (
    <div className="transaction-item">
      {onOpen ? (
        <button
          type="button"
          className="transaction-item__main"
          onClick={onOpen}
          aria-expanded={expanded}
        >
          {content}
        </button>
      ) : (
        <div className="transaction-item__main">{content}</div>
      )}
      {onDelete && (
        <button
          type="button"
          className="transaction-item__delete"
          aria-label={`${tx.description} kaydını sil`}
          title="Kaydı sil"
          onClick={onDelete}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}
