import { ArrowDownLeft, CreditCard, RotateCcw, Trash2 } from 'lucide-react'
import { fullDayLabel } from '../core/date'
import { money2 } from '../core/money'
import { categoryColor, categoryLabel } from '../domain/categories'
import { effectiveDate, type Transaction } from '../domain/types'
import { CategoryIcon } from './CategoryIcon'
import { BankLogoBadge } from './BankLogo'
import './transaction-item.css'

export interface TransactionItemProps {
  transaction: Transaction
  onOpen?: () => void
  onDelete?: () => void
  expanded?: boolean
  /** Compact variant used inside inline day previews (e.g. Daily Spending chart). */
  compact?: boolean
}

/** High-craft ledger row with dual-tone category icon badge, bank/card logo badge, and tabular signed currency. */
export function TransactionItem({
  transaction: tx,
  onOpen,
  onDelete,
  expanded,
  compact = false,
}: TransactionItemProps) {
  const incoming = tx.kind === 'income' || tx.kind === 'refund'
  const isPayment = tx.kind === 'payment'
  const isRefund = tx.kind === 'refund'
  const label =
    tx.kind === 'income'
      ? 'Gelir'
      : isPayment
        ? 'Kart borcu ödemesi'
        : categoryLabel(tx.category)
  const catColor = categoryColor(tx.category)

  const iconStyle =
    tx.kind === 'income' || isPayment
      ? undefined
      : {
          background: `linear-gradient(145deg, ${catColor}26 0%, ${catColor}10 100%)`,
          borderColor: `${catColor}42`,
          boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px ${catColor}16`,
          color: catColor,
        }

  const content = (
    <>
      <span
        className={`transaction-item__icon ${tx.kind === 'income' ? 'is-income' : isPayment ? 'is-payment' : ''}`}
        style={iconStyle}
        aria-hidden="true"
      >
        {tx.kind === 'income' ? (
          <ArrowDownLeft size={compact ? 16 : 18} strokeWidth={2.25} />
        ) : isPayment ? (
          <CreditCard size={compact ? 16 : 18} strokeWidth={2.1} />
        ) : (
          <CategoryIcon category={tx.category} size={compact ? 15 : 17} />
        )}
        {isRefund && (
          <span className="transaction-item__refund-tag" title="İade">
            <RotateCcw size={9} strokeWidth={2.6} />
          </span>
        )}
      </span>
      <span className="transaction-item__copy">
        <strong title={tx.description}>{tx.description}</strong>
        <span className="transaction-item__meta">
          <BankLogoBadge
            bank={tx.bank}
            accountLabel={tx.accountLabel}
            source={tx.source}
          />
          <small>
            {!compact && `${fullDayLabel(effectiveDate(tx))} · `}
            {label}
            {tx.kind === 'refund' ? ' · İade' : ''}
            {tx.installment ? ` · taksit ${tx.installment.current}/${tx.installment.total}` : ''}
          </small>
        </span>
      </span>
      <strong className={`transaction-item__amount num ${incoming ? 'is-income' : ''}`}>
        {tx.kind === 'expense' ? '−' : incoming ? '+' : ''}
        {money2(tx.amount)}
      </strong>
    </>
  )

  return (
    <div className={`transaction-item ${compact ? 'is-compact' : ''}`}>
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
