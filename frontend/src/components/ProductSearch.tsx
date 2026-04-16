import { useState } from 'react'
import type { Product } from '../types'

interface Props {
  products: Product[]
  onSelect: (p: Product) => void
  placeholder?: string
}

/**
 * 제품 직접 검색 선택기
 * 후보 없음 상황에서 제품명을 검색해 수동으로 선택
 */
export default function ProductSearch({ products, onSelect, placeholder = '제품명 검색...' }: Props) {
  const [q, setQ] = useState('')

  const filtered = q.trim().length >= 1
    ? products.filter(p =>
        `${p.name} ${p.color} ${p.size}`.toLowerCase().includes(q.toLowerCase()) ||
        (p.model_code ?? '').toLowerCase().includes(q.toLowerCase())
      ).slice(0, 10)
    : []

  return (
    <div className="space-y-1.5">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        autoFocus
        className="w-full max-w-xs px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs
                   focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((p, i) => (
            <button key={i} onClick={() => { onSelect(p); setQ('') }}
              className="flex flex-col gap-0.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg
                         hover:border-blue-400 hover:bg-blue-50 transition-colors text-left">
              <span className="text-xs font-semibold text-slate-800">{p.name}</span>
              <span className="text-[10px] text-slate-500">{p.color} / {p.size}</span>
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 1 && filtered.length === 0 && (
        <p className="text-[10px] text-slate-400">검색 결과 없음</p>
      )}
    </div>
  )
}
