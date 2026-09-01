interface CategoryBadgeProps {
  category: string
}

const BADGE_CLASS: Record<string, string> = {
  'Market':            'badge-green',
  'Yeme & İçme':       'badge-amber',
  'Abonelik':          'badge-purple',
  'E-Ticaret':         'badge-blue',
  'Fatura & Telekom':  'badge-slate',
  'Ulaşım & Araç':     'badge-amber',
  'Sağlık':            'badge-red',
  'Eğitim & Kitap':    'badge-slate',
  'Finans & Cüzdan':   'badge-slate',
  'Diğer':             'badge-slate',
}

export default function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <span className={`badge ${BADGE_CLASS[category] ?? 'badge-slate'}`}>
      {category}
    </span>
  )
}
