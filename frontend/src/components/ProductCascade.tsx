import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Product } from '../types'
import { getColorHex } from '../utils/colors'

interface Props {
  products: Product[]
  onSelect: (p: Product) => void
}

export default function ProductCascade({ products, onSelect }: Props) {
  const [selName,  setSelName]  = useState('')
  const [selColor, setSelColor] = useState('')
  const [selSize,  setSelSize]  = useState('')

  const names  = [...new Set(products.map(p => p.name))].sort((a, b) => a.localeCompare(b, 'ko'))
  const colors = selName
    ? [...new Set(products.filter(p => p.name === selName).map(p => p.color))]
    : []
  const sizes  = (selName && selColor)
    ? products.filter(p => p.name === selName && p.color === selColor).map(p => p.size)
    : []

  const handleName = (v: string) => { setSelName(v); setSelColor(''); setSelSize('') }
  const handleColor = (v: string) => { setSelColor(v); setSelSize('') }
  const handleSize = (v: string) => {
    setSelSize(v)
    const found = products.find(p => p.name === selName && p.color === selColor && p.size === v)
    if (found) onSelect(found)
  }

  const sel = (
    value: string,
    onChange: (v: string) => void,
    options: string[],
    placeholder: string,
    disabled = false,
    colorDots = false,
  ) => (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || options.length === 0}
        className="appearance-none border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700
                   focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white
                   disabled:bg-slate-50 disabled:text-slate-300 pr-7 w-full"
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
      {colorDots && value && (
        <span className="absolute left-2.5 top-2.5 w-2 h-2 rounded-full ring-1 ring-black/10 pointer-events-none"
          style={{ background: getColorHex(value) }} />
      )}
    </div>
  )

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="w-52">{sel(selName, handleName, names, '제품명 선택')}</div>
      <div className="w-28">
        {sel(selColor, handleColor, colors, '색상', !selName, true)}
      </div>
      <div className="w-20">
        {sel(selSize, handleSize, sizes, '사이즈', !selColor)}
      </div>
    </div>
  )
}
