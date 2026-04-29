import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { PackagePlus, RotateCcw, CheckCircle, ChevronDown, ClipboardPaste, Upload, Trash2, AlertCircle, Pencil, X, Check, LayoutGrid, AlertOctagon, Download } from 'lucide-react'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { getProducts, getInventory, createInventory, createInventoryBulk, updateInventory, deleteInventory } from '../api'
import { getColorHex } from '../utils/colors'
import type { Product, InventoryItem } from '../types'
import { autoMatch, findCandidates } from '../utils/matcher'
import type { MatchResult } from '../utils/matcher'
import ProductSearch from '../components/ProductSearch'

// ─── 공통: 입고 유형 버튼 + 설명 ────────────────────────────
type InvType = 'normal' | 'return' | 'defective'

const INV_TYPES: { value: InvType; label: string; icon: React.ReactNode; activeClass: string; desc: string | null }[] = [
  { value: 'normal',    label: '정상 입고',     icon: <PackagePlus size={15} />, activeClass: 'bg-green-600 text-white', desc: null },
  { value: 'return',    label: '변심반품 입고', icon: <RotateCcw size={15} />,   activeClass: 'bg-amber-500 text-white', desc: '재고에 더해집니다 (다시 판매 가능)' },
  { value: 'defective', label: '불량 입고',     icon: <AlertOctagon size={15} />,activeClass: 'bg-red-500 text-white',   desc: '현재고에 포함되지 않습니다 — 불량·파손품 별도 보관' },
]

function InvTypeSelector({ type, onChange }: { type: InvType; onChange: (t: InvType) => void }) {
  const current = INV_TYPES.find(t => t.value === type)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {INV_TYPES.map(t => (
          <button key={t.value} onClick={() => onChange(t.value)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${type === t.value ? t.activeClass : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {current?.desc && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
          ${type === 'return'    ? 'bg-amber-50 text-amber-700 border border-amber-200' : ''}
          ${type === 'defective' ? 'bg-red-50 text-red-700 border border-red-200' : ''}`}>
          {type === 'defective' ? <AlertOctagon size={13} /> : <RotateCcw size={13} />}
          {current.desc}
        </div>
      )}
    </div>
  )
}

// ─── 대량 입력 행 타입 ────────────────────────────────────
interface BulkInvRow {
  date: string
  productName: string   // 원본 상품명 (매칭용)
  quantity: string
  type: InvType
  notes: string
  _resolved?: Product
  _candidates?: MatchResult[]
  _error?: string
}

const EMPTY_INV_ROW = (): BulkInvRow => ({
  date: dayjs().format('YYYY-MM-DD'),
  productName: '',
  quantity: '1',
  type: 'normal',
  notes: '',
})

// ─── 단일 입력 폼 ─────────────────────────────────────────
function SingleForm({
  products,
  onAdded,
}: {
  products: Product[]
  onAdded: () => void
}) {
  const [type, setType]       = useState<InvType>('normal')
  const [product_id, setPid]  = useState<number | ''>('')
  const [date, setDate]       = useState(dayjs().format('YYYY-MM-DD'))
  const [qty, setQty]         = useState('1')
  const [notes, setNotes]     = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product_id) return
    setError('')
    try {
      await createInventory({
        date,
        product_id: product_id as number,
        quantity: Number(qty),
        type,
        notes,
      })
      setSubmitted(true)
      onAdded()
      setTimeout(() => { setSubmitted(false); setPid(''); setQty('1'); setNotes('') }, 2000)
    } catch {
      setError('등록에 실패했습니다. 다시 시도해주세요.')
    }
  }

  return (
    <div className="space-y-4">
      <InvTypeSelector type={type} onChange={setType} />

      {submitted && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <CheckCircle size={16} />
          <span className="text-sm font-medium">입고가 등록되었습니다!</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">입고 날짜</label>
            <input value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">수량</label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">제품</label>
          <div className="relative">
            <select value={product_id} onChange={e => setPid(e.target.value ? Number(e.target.value) : '')}
              className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
              <option value="">제품 선택</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} / {p.color} / {p.size}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">메모</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder={type === 'return' ? '변심반품 사유' : type === 'defective' ? '불량 사유·내용' : '입고 메모'}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <button type="submit" disabled={!product_id}
          className={`w-full py-3 text-white font-semibold rounded-xl transition-colors disabled:bg-slate-200 disabled:text-slate-400
            ${type === 'normal' ? 'bg-green-600 hover:bg-green-700'
            : type === 'return' ? 'bg-amber-500 hover:bg-amber-600'
            : 'bg-red-500 hover:bg-red-600'}`}>
          {type === 'normal' ? '정상 입고 등록' : type === 'return' ? '변심반품 입고 등록' : '불량 입고 등록'}
        </button>
      </form>
    </div>
  )
}

// ─── 그리드 대량 입력 ─────────────────────────────────────
function GridInvForm({ products, onAdded }: { products: Product[]; onAdded: () => void }) {
  const [date, setDate]       = useState(dayjs().format('YYYY-MM-DD'))
  const [type, setType]       = useState<InvType>('normal')
  const [notes, setNotes]     = useState('')
  const [quantities, setQty]  = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]   = useState<number | null>(null)

  const activeProducts = useMemo(() => products.filter(p => p.active !== false), [products])

  // 제품명 → 색상 → Product[] 그룹
  const grouped = useMemo(() => {
    const g: Record<string, Record<string, Product[]>> = {}
    for (const p of activeProducts) {
      if (!g[p.name]) g[p.name] = {}
      if (!g[p.name][p.color]) g[p.name][p.color] = []
      g[p.name][p.color].push(p)
    }
    return g
  }, [activeProducts])

  // 각 제품명별 사이즈 목록 (정렬)
  const sizesForName = useMemo(() => {
    const s: Record<string, string[]> = {}
    for (const [name, colorMap] of Object.entries(grouped)) {
      const all = [...new Set(Object.values(colorMap).flatMap(ps => ps.map(p => p.size)))]
      s[name] = all.sort((a, b) => {
        const na = parseInt(a), nb = parseInt(b)
        return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b)
      })
    }
    return s
  }, [grouped])

  const entries = Object.entries(quantities).filter(([, v]) => v && Number(v) > 0)
  const totalItems = entries.length
  const totalQty   = entries.reduce((s, [, v]) => s + Number(v), 0)

  const setQ = (id: number, val: string) =>
    setQty(prev => {
      const next = { ...prev }
      if (!val || val === '0') delete next[id]
      else next[id] = val
      return next
    })

  const handleSubmit = async () => {
    if (totalItems === 0) return
    setSubmitting(true)
    try {
      const payload = entries.map(([id, qty]) => ({
        date, product_id: Number(id), quantity: Number(qty), type, notes,
      }))
      const res = await createInventoryBulk(payload)
      setResult(res.ok)
      setQty({})
      onAdded()
      setTimeout(() => setResult(null), 2500)
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      {/* 공통 설정 */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">입고일</label>
            <input value={date} onChange={e => setDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-xs font-medium text-slate-500 block mb-1">메모 (공통)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="공통 메모 (선택)"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        <InvTypeSelector type={type} onChange={setType} />
      </div>

      {/* 제품 매트릭스 그리드 */}
      <div className="space-y-3">
        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([name, colorMap]) => {
          const sizes = sizesForName[name]
          return (
            <div key={name} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-700">{name}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ minWidth: `${120 + sizes.length * 72}px` }}>
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 w-28">색상</th>
                      {sizes.map(s => (
                        <th key={s} className="px-1 py-2 text-center text-xs font-medium text-slate-500 w-16">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {Object.entries(colorMap).sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([color, prods]) => (
                      <tr key={color} className="hover:bg-slate-50/40">
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/10"
                              style={{ background: getColorHex(color) }} />
                            {color}
                          </span>
                        </td>
                        {sizes.map(size => {
                          const prod = prods.find(p => p.size === size)
                          const val = prod ? (quantities[prod.id] ?? '') : ''
                          const hasVal = !!val && Number(val) > 0
                          return (
                            <td key={size} className="px-1 py-1.5 text-center">
                              {prod ? (
                                <input
                                  type="number" min="0" value={val}
                                  onChange={e => setQ(prod.id, e.target.value)}
                                  placeholder="0"
                                  className={`w-14 text-center border rounded-lg px-1 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400
                                    ${hasVal ? 'border-green-300 bg-green-50 text-green-700 font-semibold' : 'border-slate-200 text-slate-500'}`}
                                />
                              ) : (
                                <span className="text-slate-200 text-xs select-none">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      {result !== null && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
          <CheckCircle size={16} />{result}개 입고 등록 완료
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-400">
          {totalItems > 0 ? `${totalItems}개 품목 · 총 ${totalQty}개` : '수량을 입력하세요'}
        </span>
        <button onClick={handleSubmit} disabled={totalItems === 0 || submitting}
          className="px-6 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700
                     disabled:bg-slate-200 disabled:text-slate-400 transition-colors">
          {submitting ? '등록 중...' : `${totalQty}개 입고 등록`}
        </button>
      </div>
    </div>
  )
}

// ─── 입고 등록 표준 양식 다운로드 ────────────────────────────
function downloadInventoryTemplate() {
  const wb = XLSX.utils.book_new()

  const guide = [
    ['야크 재고관리 — 입고 등록 표준 양식 가이드'],
    [],
    ['열 이름', '필수', '형식 / 예시', '설명'],
    ['상품명',  '필수', 'H티아고 자켓 블랙 95', '상품명 (색상·사이즈 함께 입력 권장)'],
    ['수량',    '필수', '10', '입고 수량 (숫자만)'],
    ['날짜',    '선택', 'YYYY-MM-DD  예) 2026-04-29', '입고일 (없으면 오늘 날짜로 처리)'],
    ['메모',    '선택', '4월 정기입고', '참고용 메모'],
    [],
    ['입고 유형 (대량 입력 시 공통 적용)'],
    ['정상 입고',     '일반적인 입고 — 재고에 합산됨'],
    ['변심반품 입고', '반품 후 재판매 가능한 물건 — 재고에 합산됨'],
    ['불량 입고',     '불량·파손품 — 재고에 포함되지 않음 (별도 보관)'],
    [],
    ['주의사항'],
    ['1. 날짜는 YYYY-MM-DD 형식으로 입력 (예: 2026-04-29), 생략 시 오늘 날짜 자동 적용'],
    ['2. 상품명이 정확하지 않아도 자동 매칭됩니다'],
    ['3. 두 번째 시트 "입고양식"에 데이터를 입력하세요'],
  ]
  const wsGuide = XLSX.utils.aoa_to_sheet(guide)
  wsGuide['!cols'] = [{ wch: 14 }, { wch: 6 }, { wch: 32 }, { wch: 32 }]
  XLSX.utils.book_append_sheet(wb, wsGuide, '가이드라인')

  const today = dayjs().format('YYYY-MM-DD')
  const headers = ['상품명', '수량', '날짜', '메모']
  const example = ['H티아고 자켓 블랙 95', '10', today, '4월 정기입고']
  const wsForm = XLSX.utils.aoa_to_sheet([headers, example])
  wsForm['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 24 }]
  XLSX.utils.book_append_sheet(wb, wsForm, '입고양식')

  XLSX.writeFile(wb, `입고등록_표준양식_${today}.xlsx`)
}

// ─── 대량 입력 폼 ─────────────────────────────────────────
function BulkForm({
  products,
  onAdded,
}: {
  products: Product[]
  onAdded: () => void
}) {
  const [subMode, setSubMode]     = useState<'paste' | 'file'>('paste')
  const [pasteText, setPasteText] = useState('')
  const [rows, setRows]           = useState<BulkInvRow[]>([EMPTY_INV_ROW()])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]       = useState<{ ok: number; fail: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 제품 매칭
  const matchProduct = (r: BulkInvRow): Pick<BulkInvRow, '_resolved' | '_candidates'> => {
    if (!r.productName.trim()) return { _resolved: undefined, _candidates: undefined }
    const auto = autoMatch(r.productName, products)
    if (auto) return { _resolved: auto.product, _candidates: undefined }
    const candidates = findCandidates(r.productName, products, 5, 25)
    // fuzzy 100점이면 자동 매칭
    if (candidates.length > 0 && candidates[0].score >= 100) {
      return { _resolved: candidates[0].product, _candidates: undefined }
    }
    return { _resolved: undefined, _candidates: candidates }
  }

  const validateRows = (rawRows: BulkInvRow[]): BulkInvRow[] =>
    rawRows.map(r => {
      if (!r.date) return { ...r, _error: '날짜 필수', _resolved: undefined, _candidates: undefined }
      if (!r.quantity || isNaN(Number(r.quantity)) || Number(r.quantity) < 1)
        return { ...r, _error: '수량 오류', _resolved: undefined, _candidates: undefined }
      return { ...r, _error: undefined, ...matchProduct(r) }
    })

  // 붙여넣기 파싱 — 탭 구분(엑셀) / 다중 공백 구분(텍스트) / 헤더 자동 감지
  const HEADER_MAP: Record<string, keyof BulkInvRow> = {
    '발주일자': 'date', '발주일': 'date',
    '날짜': 'date', '입고일': 'date', '입고일자': 'date',
    '상품명': 'productName', '제품명': 'productName', '품명': 'productName',
    '상  품  명': 'productName',
    '수량': 'quantity',
    '메모': 'notes', '비고': 'notes', '반품사유': 'notes', '배송메모': 'notes',
    '유형': 'type', '입고유형': 'type',
  }

  const parsePaste = (text: string): BulkInvRow[] => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) return []

    // 탭 포함 여부로 구분자 자동 감지: 탭 없으면 2칸 이상 공백으로 분리
    const hasTab = lines.some(l => l.includes('\t'))
    const splitLine = (line: string): string[] =>
      hasTab
        ? line.split('\t').map(s => s.trim())
        : line.split(/  +/).map(s => s.trim()).filter(s => s !== '')

    const firstCols = splitLine(lines[0])
    const firstVal  = firstCols[0].toLowerCase().replace(/\s+/g, '')

    const looksLikeDate = !!(firstVal.match(/^\d+\.\d+$/) || firstVal.match(/^\d{4}-\d{2}-\d{2}$/))
    const isKnownHeader = firstCols.some(h => {
      const k = h.toLowerCase().replace(/\s+/g, '')
      return !!(HEADER_MAP[h.trim()] ?? HEADER_MAP[k] ?? (h.trim() === '색상' || h.trim() === '사이즈'))
    })
    const isHeader = !looksLikeDate && isKnownHeader

    let colMap: (keyof BulkInvRow | null)[]
    let colorIdx = -1
    let sizeIdx  = -1

    if (isHeader) {
      colMap = firstCols.map((h, idx) => {
        const k = h.toLowerCase().replace(/\s+/g, '')
        if (h.trim() === '색상' || k === '색상') { colorIdx = idx; return null }
        if (h.trim() === '사이즈' || k === '사이즈') { sizeIdx = idx; return null }
        return HEADER_MAP[h.trim()] ?? HEADER_MAP[k] ?? null
      })
    } else if (looksLikeDate) {
      // 발주 스프레드시트 14열 기본 순서
      colMap = [
        'date', null, null, null, null, null, null,
        null, null, null, null, null,
        'productName', 'quantity',
      ]
    } else {
      // 단순 형식: 상품명 · 수량 · 날짜 · 메모
      colMap = ['productName', 'quantity', 'date', 'notes']
    }

    const dataLines = isHeader ? lines.slice(1) : lines
    return dataLines.map(line => {
      const cells = splitLine(line)
      const row: BulkInvRow = {
        date: dayjs().format('YYYY-MM-DD'),
        productName: '',
        quantity: '1',
        type: 'normal',
        notes: '',
      }
      colMap.forEach((field, idx) => {
        if (field && cells[idx] !== undefined && cells[idx] !== '') {
          if (field === 'type') {
            const v = cells[idx].toLowerCase()
            row.type = (v.includes('반품') || v === 'return') ? 'return' : 'normal'
          } else if (field === 'date') {
            // M.DD → YYYY-MM-DD 자동 변환
            const raw = cells[idx]
            const oldFmt = raw.match(/^(\d{1,2})\.(\d{2})$/)
            row.date = oldFmt
              ? `${dayjs().year()}-${String(Number(oldFmt[1])).padStart(2,'0')}-${oldFmt[2]}`
              : raw
          } else {
            ;(row as unknown as Record<string, string>)[field] = cells[idx]
          }
        }
      })
      const colorPart = colorIdx >= 0 ? cells[colorIdx] ?? '' : ''
      const sizePart  = sizeIdx  >= 0 ? cells[sizeIdx]  ?? '' : ''
      if (colorPart || sizePart) {
        row.productName = [row.productName, colorPart, sizePart].filter(Boolean).join(' ')
      }
      return row
    }).filter(r => r.productName)
  }

  const handlePaste = () => {
    const parsed = parsePaste(pasteText)
    if (parsed.length === 0) return
    setRows(validateRows(parsed))
    setPasteText('')
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
      const raw = data.map(r => r.map(v => String(v ?? '').trim()).join('\t')).join('\n')
      const parsed = parsePaste(raw)
      setRows(validateRows(parsed))
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsBinaryString(file)
  }

  const updateRow = (i: number, key: keyof BulkInvRow, val: string) => {
    setRows(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [key]: val }
      if (key === 'productName') {
        next[i] = { ...next[i], ...matchProduct(next[i]) }
      }
      return next
    })
  }

  const selectCandidate = (i: number, match: MatchResult) => {
    setRows(prev => {
      const next = [...prev]
      next[i] = {
        ...next[i],
        productName: `${match.product.name} ${match.product.color} ${match.product.size}`,
        _resolved:   match.product,
        _candidates: undefined,
        _error:      undefined,
      }
      return next
    })
  }

  const removeRow = (i: number) =>
    setRows(prev => prev.length === 1 ? [EMPTY_INV_ROW()] : prev.filter((_, idx) => idx !== i))

  const addRow = () => setRows(prev => [...prev, EMPTY_INV_ROW()])

  const handleSubmit = async () => {
    const valid = rows.filter(r => r._resolved)
    if (valid.length === 0) return
    setSubmitting(true)
    try {
      const payload = valid.map(r => ({
        date: r.date,
        product_id: r._resolved!.id,
        quantity: Number(r.quantity),
        type: r.type,
        notes: r.notes,
      }))
      const res = await createInventoryBulk(payload)
      setResult({ ok: res.ok, fail: res.fail.length })
      onAdded()
      if (res.fail.length === 0) setTimeout(() => { setRows([EMPTY_INV_ROW()]); setResult(null) }, 2500)
    } catch {
      setResult({ ok: 0, fail: valid.length })
    }
    setSubmitting(false)
  }

  const validCount     = rows.filter(r => r._resolved).length
  const errorCount     = rows.filter(r => r._error).length
  const candidateCount = rows.filter(r => !r._resolved && !r._error && r._candidates !== undefined).length

  return (
    <div className="space-y-4">
      {/* 서브모드 탭 */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setSubMode('paste')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${subMode === 'paste' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
          <ClipboardPaste size={15} />엑셀 붙여넣기
        </button>
        <button onClick={() => setSubMode('file')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${subMode === 'file' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
          <Upload size={15} />파일 업로드
        </button>
        <button onClick={downloadInventoryTemplate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-50 ml-auto">
          <Download size={15} />표준 양식
        </button>
      </div>

      {subMode === 'paste' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-600 mb-0.5">스프레드시트 데이터를 붙여넣으세요</p>
            <p className="text-xs text-slate-400">
              열 순서: <span className="font-mono bg-slate-50 px-1 rounded">상품명(색상/사이즈/모델코드 포함) · 수량 · 날짜 · 메모</span>
              &nbsp;— 헤더 포함 복사도 됩니다
            </p>
          </div>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            onPaste={e => {
              const data = e.clipboardData.getData('text')
              setTimeout(() => {
                const parsed = parsePaste(data)
                if (parsed.length > 0) { setRows(validateRows(parsed)); setPasteText('') }
              }, 0)
            }}
            placeholder="여기에 Ctrl+V로 붙여넣기"
            rows={4}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          {pasteText && (
            <button onClick={handlePaste}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
              파싱하기
            </button>
          )}
        </div>
      )}

      {subMode === 'file' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
            <Upload size={28} className="text-slate-300" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600">Excel 파일을 선택하거나 드래그하세요</p>
              <p className="text-xs text-slate-400 mt-1">.xlsx, .xls 지원 · 열 순서: 상품명 · 수량 · 날짜 · 메모</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </label>
        </div>
      )}

      {/* 붙여넣기/파일 결과 테이블 */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">{rows.length}행</span>
            {validCount > 0     && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{validCount}개 등록 가능</span>}
            {candidateCount > 0 && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{candidateCount}개 수동 매칭 필요</span>}
            {errorCount > 0     && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">{errorCount}개 오류</span>}
          </div>
          <button onClick={addRow} className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors">
            + 행 추가
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: '700px' }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-2 py-2 text-left font-medium text-slate-500 w-8">#</th>
                <th className="px-2 py-2 text-left font-medium text-slate-500 w-20">날짜</th>
                <th className="px-2 py-2 text-left font-medium text-slate-500">상품명</th>
                <th className="px-2 py-2 text-left font-medium text-slate-500 w-14">수량</th>
                <th className="px-2 py-2 text-left font-medium text-slate-500 w-20">유형</th>
                <th className="px-2 py-2 text-left font-medium text-slate-500 w-32">메모</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => {
                const hasCandidates = !row._resolved && !row._error && row._candidates !== undefined
                return (
                  <Fragment key={i}>
                    <tr className={
                      row._error    ? 'bg-red-50' :
                      row._resolved ? 'bg-green-50/40' :
                      hasCandidates ? 'bg-amber-50/40' : 'bg-white'
                    }>
                      <td className="px-2 py-1.5 text-slate-400 text-center">
                        {row._resolved
                          ? <span className="text-green-500">✓</span>
                          : row._error
                          ? <AlertCircle size={13} className="text-red-400 mx-auto" />
                          : i + 1}
                      </td>

                      {/* 날짜 */}
                      <td className="px-1 py-1">
                        <input value={row.date} onChange={e => updateRow(i, 'date', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </td>

                      {/* 상품명 + 매칭 결과 */}
                      <td className="px-1 py-1">
                        <div className="flex flex-col gap-0.5">
                          <input value={row.productName} onChange={e => updateRow(i, 'productName', e.target.value)}
                            placeholder="상품명 입력 또는 붙여넣기"
                            className={`w-full px-2 py-1 rounded border text-xs focus:outline-none focus:ring-1 ${
                              row._error    ? 'border-red-300 bg-red-50 focus:ring-red-400' :
                              row._resolved ? 'border-green-300 bg-green-50/40 focus:ring-green-400' :
                              hasCandidates ? 'border-amber-300 bg-amber-50/40 focus:ring-amber-400' :
                              'border-slate-200 bg-white focus:ring-blue-400'
                            }`} />
                          {row._resolved && (
                            <span className="text-[10px] text-green-700 font-medium px-1 truncate">
                              → {row._resolved.name} / {row._resolved.color} / {row._resolved.size}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 수량 */}
                      <td className="px-1 py-1">
                        <input type="number" value={row.quantity} onChange={e => updateRow(i, 'quantity', e.target.value)} min="1"
                          className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </td>

                      {/* 유형 */}
                      <td className="px-1 py-1">
                        <select value={row.type} onChange={e => updateRow(i, 'type', e.target.value as 'normal' | 'return')}
                          className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none">
                          <option value="normal">정상</option>
                          <option value="return">반품</option>
                        </select>
                      </td>

                      {/* 메모 */}
                      <td className="px-1 py-1">
                        <input value={row.notes} onChange={e => updateRow(i, 'notes', e.target.value)}
                          placeholder="메모"
                          className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </td>

                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => removeRow(i)} className="text-slate-300 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>

                    {/* 후보 선택 */}
                    {hasCandidates && row._candidates!.length > 0 && (
                      <tr className="bg-amber-50/60 border-t border-amber-100">
                        <td></td>
                        <td colSpan={6} className="px-3 py-2.5">
                          <p className="text-[10px] text-amber-700 font-semibold mb-2">
                            자동 매칭 실패 — 후보에서 선택하세요:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {row._candidates!.map((m, ci) => {
                              const scoreColor = m.score >= 90 ? 'text-green-600 bg-green-50'
                                : m.score >= 70 ? 'text-amber-600 bg-amber-50'
                                : 'text-red-500 bg-red-50'
                              const scoreLabel = m.score >= 90 ? '높음' : m.score >= 70 ? '중간' : '낮음'
                              return (
                                <button key={ci} onClick={() => selectCandidate(i, m)}
                                  className="flex flex-col gap-1 px-3 py-2 bg-white border border-amber-200 rounded-lg hover:border-amber-400 hover:bg-amber-50 hover:shadow-sm transition-all text-left min-w-[120px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${scoreColor}`}>
                                      {m.score.toFixed(0)}%
                                    </span>
                                    <span className={`text-[10px] font-medium ${scoreColor.split(' ')[0]}`}>
                                      {scoreLabel}
                                    </span>
                                  </div>
                                  <span className="text-xs font-semibold text-slate-800 leading-tight">{m.product.name}</span>
                                  <span className="text-[10px] text-slate-500 leading-tight">{m.product.color} / {m.product.size}</span>
                                </button>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    {hasCandidates && row._candidates!.length === 0 && row.productName && (
                      <tr className="bg-amber-50/60 border-t border-amber-100">
                        <td></td>
                        <td colSpan={6} className="px-3 py-2.5">
                          <p className="text-[10px] text-amber-700 font-semibold mb-2">
                            자동 매칭 실패 — 제품을 직접 검색하여 선택하세요:
                          </p>
                          <ProductSearch
                            products={products}
                            onSelect={p => selectCandidate(i, { product: p, score: 100, matchType: 'manual' })}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {result && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium
          ${result.fail === 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          <CheckCircle size={16} />
          {result.ok}개 입고 등록 완료{result.fail > 0 && ` · ${result.fail}개 실패`}
        </div>
      )}

      <button onClick={handleSubmit} disabled={validCount === 0 || submitting}
        className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700
                   disabled:bg-slate-200 disabled:text-slate-400 transition-colors">
        {submitting ? '등록 중...' : `${validCount}건 입고 등록`}
      </button>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────
export default function InventoryManage() {
  const [inputMode, setInputMode] = useState<'single' | 'bulk' | 'grid'>('single')
  const [products, setProducts]   = useState<Product[]>([])
  const [history, setHistory]     = useState<InventoryItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editingId, setEditingId]     = useState<number | null>(null)
  const [editQty, setEditQty]         = useState('')
  const [deleting, setDeleting]       = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [editError, setEditError]     = useState(false)

  const loadHistory = () => {
    getInventory().then(items =>
      setHistory([...items].reverse().slice(0, 50))
    )
  }

  useEffect(() => {
    getProducts().then(setProducts)
    loadHistory()
  }, [])

  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })

  const toggleAll = () => {
    if (selectedIds.size === history.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(history.map(i => i.id)))
  }

  const handleSaveEdit = async (item: InventoryItem) => {
    const qty = Number(editQty)
    if (!qty || qty < 1) return
    setEditError(false)
    try {
      await updateInventory(item.id, {
        date: item.date, product_id: item.product_id,
        quantity: qty, type: item.type, notes: item.notes ?? '',
      })
      setEditingId(null)
      loadHistory()
    } catch {
      setEditError(true)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    setDeleting(true)
    setDeleteError(false)
    try {
      await Promise.all([...selectedIds].map(id => deleteInventory(id)))
      setSelectedIds(new Set())
      loadHistory()
    } catch {
      setDeleteError(true)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-3 md:p-6 max-w-4xl space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">입고 관리</h1>
        <p className="text-sm text-slate-400 mt-1">정상 입고와 반품 입고를 구분하여 등록하세요</p>
      </div>

      {/* 입력 모드 탭 */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
        <button onClick={() => setInputMode('single')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${inputMode === 'single' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          낱개 입력
        </button>
        <button onClick={() => setInputMode('bulk')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${inputMode === 'bulk' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          텍스트 대량
        </button>
        <button onClick={() => setInputMode('grid')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${inputMode === 'grid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <LayoutGrid size={14} />그리드 대량
        </button>
      </div>

      {inputMode === 'single' && <SingleForm products={products} onAdded={loadHistory} />}
      {inputMode === 'bulk'   && <BulkForm   products={products} onAdded={loadHistory} />}
      {inputMode === 'grid'   && <GridInvForm products={products} onAdded={loadHistory} />}

      {(deleteError || editError) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {editError ? '수정에 실패했습니다.' : '삭제에 실패했습니다.'} 다시 시도해주세요.
        </div>
      )}

      {/* 입고 내역 */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 text-sm">최근 입고 내역 (최근 50건)</h2>
          {selectedIds.size > 0 && (
            <button onClick={handleDeleteSelected} disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50">
              <Trash2 size={13} />{selectedIds.size}건 삭제
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {history.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">입고 내역 없음</p>
          ) : (
            <>
              {/* 전체 선택 행 */}
              <div className="flex items-center gap-3 px-5 py-2 bg-slate-50">
                <input type="checkbox"
                  checked={selectedIds.size === history.length && history.length > 0}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer" />
                <span className="text-xs text-slate-400">전체 선택</span>
              </div>
              {history.map(item => (
                <div key={item.id} className={`flex items-center gap-3 px-5 py-3 transition-colors
                  ${selectedIds.has(item.id) ? 'bg-red-50' : ''}`}>
                  <input type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="w-3.5 h-3.5 accent-red-500 cursor-pointer flex-shrink-0" />
                  <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0
                    ${item.type === 'normal' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.type === 'normal' ? '정상' : '반품'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">
                      {item.product ? `${item.product.name} / ${item.product.color} / ${item.product.size}` : `제품 #${item.product_id}`}
                    </p>
                    <p className="text-xs text-slate-400">{item.date}{item.notes ? ` · ${item.notes}` : ''}</p>
                  </div>
                  {editingId === item.id ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input
                        type="number" value={editQty} min="1"
                        onChange={e => setEditQty(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item); if (e.key === 'Escape') setEditingId(null) }}
                        autoFocus
                        className="w-16 px-2 py-1 border border-blue-400 rounded text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-400" />
                      <button onClick={() => handleSaveEdit(item)}
                        className="p-1 text-green-600 hover:text-green-700 transition-colors">
                        <Check size={15} />
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-bold text-slate-700">+{item.quantity}</span>
                      <button onClick={() => { setEditingId(item.id); setEditQty(String(item.quantity)) }}
                        className="p-1 text-slate-300 hover:text-blue-500 transition-colors">
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
