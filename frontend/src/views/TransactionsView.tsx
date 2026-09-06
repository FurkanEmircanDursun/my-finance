import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Download, Plus, Tag, Trash2 } from 'lucide-react'
import { Badge, Button, Empty, Section, Segmented, TextInput, Field } from '../ui/primitives'
import { Modal, ConfirmDialog } from '../ui/Modal'
import { money2, money, count, toMinor } from '../core/money'
import { fullDayLabel, parseAnyDate, todayKey } from '../core/date'
import { normalizeMerchant } from '../core/text'
import { hash } from '../core/hash'
import { CATEGORIES, categoryColor, categoryLabel, type CategoryId } from '../domain/categories'
import type { Transaction, TxKind } from '../domain/types'
import { useStore } from '../store/AppStore'

const PAGE_SIZE = 100

const KIND_LABEL: Record<TxKind, string> = {
  expense: 'Harcama',
  refund: 'İade',
  income: 'Gelir',
  payment: 'Borç ödeme',
}

type SortKey = 'date' | 'amount'

export function TransactionsView({ transactions }: { transactions: Transaction[] }) {
  const { dispatch } = useStore()

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDesc, setSortDesc] = useState(true)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [categoryModal, setCategoryModal] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const sorted = useMemo(() => {
    const list = [...transactions]
    list.sort((a, b) => {
      const cmp = sortKey === 'amount' ? a.amount - b.amount : a.date < b.date ? -1 : a.date > b.date ? 1 : 0
      return sortDesc ? -cmp : cmp
    })
    return list
  }, [transactions, sortKey, sortDesc])

  const page = sorted.slice(0, limit)
  const allPageSelected = page.length > 0 && page.every((tx) => selected.has(tx.id))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected) page.forEach((tx) => next.delete(tx.id))
      else page.forEach((tx) => next.add(tx.id))
      return next
    })
  }

  const exportCsv = () => {
    const header = ['Tarih', 'Açıklama', 'İşyeri', 'Kategori', 'Tür', 'Tutar', 'Banka', 'Taksit']
    const rows = sorted.map((tx) => [
      tx.date,
      tx.description.replace(/"/g, '""'),
      tx.merchant,
      categoryLabel(tx.category),
      KIND_LABEL[tx.kind],
      (tx.amount / 100).toFixed(2).replace('.', ','),
      tx.bank,
      tx.installment ? `${tx.installment.current}/${tx.installment.total}` : '',
    ])

    const csv = [header, ...rows].map((r) => r.map((cell) => `"${cell}"`).join(';')).join('\r\n')
    // BOM so Excel opens Turkish characters correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `my-finance-islemler-${todayKey()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!transactions.length) {
    return <Empty title="Bu filtreyle işlem yok" description="Dönem veya arama kriterlerini genişletin." />
  }

  return (
    <div className="space-y-4">
      <Section
        title="İşlemler"
        description={`${count(transactions.length)} kayıt${selected.size ? ` · ${count(selected.size)} seçili` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.size > 0 && (
              <>
                <Button size="sm" variant="primary" onClick={() => setCategoryModal(true)}>
                  <Tag size={12} />
                  Kategori ata
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={12} />
                  Sil
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Seçimi bırak
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => setAddModal(true)}>
              <Plus size={12} />
              İşlem ekle
            </Button>
            <Button size="sm" onClick={exportCsv}>
              <Download size={12} />
              CSV
            </Button>
          </div>
        }
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-label text-faint">
                <th className="w-9 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Sayfadaki tüm işlemleri seç"
                    checked={allPageSelected}
                    onChange={togglePage}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Tarih"
                    active={sortKey === 'date'}
                    desc={sortDesc}
                    onClick={() => {
                      setSortKey('date')
                      setSortDesc((d) => (sortKey === 'date' ? !d : true))
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Açıklama</th>
                <th className="px-3 py-2.5 font-medium">Kategori</th>
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Tür</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Banka</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  <SortHeader
                    label="Tutar"
                    active={sortKey === 'amount'}
                    desc={sortDesc}
                    onClick={() => {
                      setSortKey('amount')
                      setSortDesc((d) => (sortKey === 'amount' ? !d : true))
                    }}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {page.map((tx) => (
                <tr
                  key={tx.id}
                  className={`border-b border-line last:border-b-0 hover:bg-hover ${
                    selected.has(tx.id) ? 'bg-accent-soft' : ''
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`${tx.description} işlemini seç`}
                      checked={selected.has(tx.id)}
                      onChange={() => toggle(tx.id)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-label text-muted">
                    {fullDayLabel(tx.date)}
                  </td>
                  <td className="max-w-[280px] px-3 py-2.5">
                    <p className="truncate text-label font-medium text-ink" title={tx.description}>
                      {tx.description}
                    </p>
                    {tx.installment && (
                      <p className="text-label text-faint">
                        Taksit {tx.installment.current}/{tx.installment.total}
                        {tx.installment.principal ? ` · ana tutar ${money(tx.installment.principal)}` : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge dot={categoryColor(tx.category)}>
                      {categoryLabel(tx.category)}
                      {tx.categoryLocked && <Check size={9} className="text-accent" />}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-2.5 text-label text-muted lg:table-cell">
                    {KIND_LABEL[tx.kind]}
                  </td>
                  <td className="hidden px-3 py-2.5 text-label text-muted md:table-cell">{tx.bank}</td>
                  <td
                    className={`num whitespace-nowrap px-3 py-2.5 text-right text-label font-medium ${
                      tx.kind === 'expense' ? 'text-ink' : 'text-positive'
                    }`}
                  >
                    {tx.kind === 'expense' ? '' : '+'}
                    {money2(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {limit < sorted.length && (
          <div className="border-t border-line p-3 text-center">
            <Button size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              {count(sorted.length - limit)} işlem daha göster
            </Button>
          </div>
        )}
      </Section>

      <CategoryAssignModal
        open={categoryModal}
        onClose={() => setCategoryModal(false)}
        selectedIds={[...selected]}
        selectedTransactions={transactions.filter((t) => selected.has(t.id))}
        onDone={() => {
          setCategoryModal(false)
          setSelected(new Set())
        }}
      />

      <ManualTransactionModal open={addModal} onClose={() => setAddModal(false)} />

      <ConfirmDialog
        open={deleteOpen}
        title="İşlemleri sil"
        message={`${count(selected.size)} işlem analizden kaldırılacak. Kaynak ekstreyi yeniden yükleyerek geri getirebilirsiniz.`}
        confirmLabel="Sil"
        destructive
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          dispatch({ type: 'deleteTransactions', ids: [...selected] })
          setSelected(new Set())
          setDeleteOpen(false)
        }}
      />
    </div>
  )
}

function SortHeader({
  label,
  active,
  desc,
  onClick,
}: {
  label: string
  active: boolean
  desc: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 ${active ? 'text-ink' : 'hover:text-ink'}`}
    >
      {label}
      {active && (desc ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
    </button>
  )
}

/* ── Category assignment ─────────────────────────────────────────────────── */

function CategoryAssignModal({
  open,
  onClose,
  selectedIds,
  selectedTransactions,
  onDone,
}: {
  open: boolean
  onClose: () => void
  selectedIds: string[]
  selectedTransactions: Transaction[]
  onDone: () => void
}) {
  const { dispatch } = useStore()
  const [learn, setLearn] = useState(true)
  const [choice, setChoice] = useState<CategoryId | null>(null)

  const merchants = [...new Set(selectedTransactions.map((t) => t.merchant))]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kategori ata"
      description={`${count(selectedIds.length)} işlem · ${count(merchants.length)} işyeri`}
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!choice}
            onClick={() => {
              if (!choice) return
              dispatch({ type: 'setCategory', transactionIds: selectedIds, category: choice, learn })
              onDone()
            }}
          >
            Uygula
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {CATEGORIES.map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => setChoice(def.id)}
            className={`flex items-center gap-2 rounded border px-2.5 py-2 text-left text-label transition-colors ${
              choice === def.id
                ? 'border-accent bg-accent-soft text-accent-text'
                : 'border-line bg-sunken text-ink hover:bg-hover'
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color }} />
            <span className="truncate">{def.label}</span>
          </button>
        ))}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded border border-line bg-sunken px-3 py-2.5">
        <input
          type="checkbox"
          checked={learn}
          onChange={(e) => setLearn(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
        />
        <span className="text-label leading-relaxed text-muted">
          <span className="font-medium text-ink">Kural olarak kaydet.</span> Seçili işyerlerinin tüm geçmiş
          ve gelecek işlemleri bu kategoriye atanır. Kuralları Ayarlar bölümünden kaldırabilirsiniz.
        </span>
      </label>

      {merchants.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-label text-faint">Etkilenecek işyerleri</p>
          <div className="flex flex-wrap gap-1">
            {merchants.slice(0, 12).map((merchant) => (
              <Badge key={merchant}>{merchant}</Badge>
            ))}
            {merchants.length > 12 && <Badge>+{merchants.length - 12}</Badge>}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ── Manual entry ────────────────────────────────────────────────────────── */

function ManualTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch } = useStore()
  const [date, setDate] = useState(todayKey())
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<TxKind>('expense')
  const [category, setCategory] = useState<CategoryId>('other')

  const reset = () => {
    setDate(todayKey())
    setDescription('')
    setAmount('')
    setKind('expense')
    setCategory('other')
  }

  const valid = description.trim().length > 0 && Number.parseFloat(amount.replace(',', '.')) > 0

  const submit = () => {
    const parsedDate = parseAnyDate(date) ?? todayKey()
    const value = toMinor(Math.abs(Number.parseFloat(amount.replace(',', '.'))))
    const merchant = normalizeMerchant(description)

    dispatch({
      type: 'addManual',
      transaction: {
        id: hash(`manual|${parsedDate}|${value}|${merchant}|${Date.now()}`),
        date: parsedDate,
        description: description.trim(),
        merchant,
        amount: value,
        kind,
        category,
        categoryLocked: true,
        bank: 'Manuel',
        accountLabel: 'Manuel kayıt',
        installment: null,
        source: 'manual',
      },
    })

    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="İşlem ekle"
      description="Ekstrede görünmeyen nakit veya havale kayıtları için"
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            Vazgeç
          </Button>
          <Button size="sm" variant="primary" disabled={!valid} onClick={submit}>
            Ekle
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Tarih">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Açıklama">
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Örn. Kira ödemesi"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tutar (₺)">
            <TextInput
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </Field>
          <Field label="Tür">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'expense', label: 'Harcama' },
                { value: 'income', label: 'Gelir' },
              ]}
              className="mt-1"
            />
          </Field>
        </div>

        <Field label="Kategori">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CATEGORIES.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => setCategory(def.id)}
                className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-left text-label transition-colors ${
                  category === def.id
                    ? 'border-accent bg-accent-soft text-accent-text'
                    : 'border-line bg-sunken text-ink hover:bg-hover'
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color }} />
                <span className="truncate">{def.label}</span>
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
