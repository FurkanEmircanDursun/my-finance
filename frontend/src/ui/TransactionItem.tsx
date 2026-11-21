import { ArrowDownLeft, Banknote, CreditCard, Trash2 } from 'lucide-react'
import { fullDayLabel } from '../core/date'
import { money2 } from '../core/money'
import { categoryLabel } from '../domain/categories'
import { effectiveDate, type Transaction } from '../domain/types'
import './transaction-item.css'

export interface TransactionItemProps {
  transaction: Transaction
  onOpen?: () => void
  onDelete?: () => void
  expanded?: boolean
}

/** A readable record and its independent, always-visible delete action. */
export function TransactionItem({ transaction: tx, onOpen, onDelete, expanded }: TransactionItemProps) {
  const incoming = tx.kind === 'income' || tx.kind === 'refund'
  const label = tx.kind === 'income' ? 'Gelir' : tx.kind === 'payment' ? 'Kart borcu ödemesi' : categoryLabel(tx.category)
  const content = <>
    <span className={`transaction-item__icon ${incoming ? 'is-income' : ''}`} aria-hidden="true">
      {incoming ? <ArrowDownLeft size={18} /> : tx.source === 'manual' ? <Banknote size={18} /> : <CreditCard size={18} />}
    </span>
    <span className="transaction-item__copy">
      <strong title={tx.description}>{tx.description}</strong>
      <small>{fullDayLabel(effectiveDate(tx))} · {label}{tx.kind === 'refund' ? ' · İade' : ''}{tx.installment ? ` · taksit ${tx.installment.current}/${tx.installment.total}` : ''}</small>
    </span>
    <strong className={`transaction-item__amount num ${incoming ? 'is-income' : ''}`}>{tx.kind === 'expense' ? '−' : incoming ? '+' : ''}{money2(tx.amount)}</strong>
  </>
  return <div className="transaction-item">
    {onOpen ? <button type="button" className="transaction-item__main" onClick={onOpen} aria-expanded={expanded}>{content}</button> : <div className="transaction-item__main">{content}</div>}
    {onDelete && <button type="button" className="transaction-item__delete" aria-label={`${tx.description} kaydını sil`} title="Kaydı sil" onClick={onDelete}><Trash2 size={17} /></button>}
  </div>
}
