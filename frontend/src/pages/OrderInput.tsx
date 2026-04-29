import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { CheckCircle, ChevronDown, Upload, ClipboardPaste, Trash2, AlertCircle, HelpCircle, LayoutGrid, Download } from 'lucide-react'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { getProducts, createOrder, createOrdersBulk, getOrders } from '../api'
import type { Product, Order } from '../types'
import { autoMatch, findCandidates, scoreLabel, matchTypeBadge } from '../utils/matcher'
import type { MatchResult } from '../utils/matcher'
import ProductCascade from '../components/ProductCascade'
import { getColorHex } from '../utils/colors'

const colorDot = (color: string) => (
  <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/10"
    style={{ background: getColorHex(color) }} />
)

// ─── 공통 타입 ────────────────────────────────────────────
interface BulkRow {
  date: string
  productName: string
  color: string
  size: string
  quantity: string
  order_date: string
  storage: string
  mall: string
  orderer: string
  recipient: string
  phone: string
  address: string
  memo: string
  _resolved?: Product        // 매칭된 제품
  _matchType?: string        // 매칭 방식
  _candidates?: MatchResult[] // 수동 매칭 후보 (autoMatch 실패 시)
  _error?: string            // 날짜/수량 오류 (제품 매칭 외)
  _showSearch?: boolean      // 직접검색 패널 토글
}

const BULK_COLS: { key: keyof BulkRow; label: string; width: string; placeholder: string }[] = [
  { key: 'date',        label: '발주일',   width: 'w-20',  placeholder: '4.16' },
  { key: 'productName', label: '제품명',   width: 'w-56',  placeholder: 'H티아고 자켓' },
  { key: 'color',       label: '색상',     width: 'w-24',  placeholder: '블랙' },
  { key: 'size',        label: '사이즈',   width: 'w-16',  placeholder: '95' },
  { key: 'quantity',    label: '수량',     width: 'w-14',  placeholder: '1' },
  { key: 'order_date',  label: '주문일자', width: 'w-20',  placeholder: '4.16' },
  { key: 'storage',     label: '보관창고', width: 'w-24',  placeholder: '뉴페이스' },
  { key: 'mall',        label: 'MALL',     width: 'w-24',  placeholder: '해솔앤코' },
  { key: 'orderer',     label: '주문자',   width: 'w-20',  placeholder: '홍길동' },
  { key: 'recipient',   label: '수령인',   width: 'w-20',  placeholder: '홍길동' },
  { key: 'phone',       label: '휴대폰',   width: 'w-28',  placeholder: '010-0000-0000' },
  { key: 'address',     label: '주소',     width: 'w-48',  placeholder: '서울시...' },
  { key: 'memo',        label: '메모',     width: 'w-32',  placeholder: '' },
]

const EMPTY_ROW = (): BulkRow => ({
  date: dayjs().format('YYYY-MM-DD'), productName: '', color: '', size: '',
  quantity: '1', order_date: dayjs().format('YYYY-MM-DD'), storage: '뉴페이스',
  mall: '', orderer: '', recipient: '', phone: '', address: '', memo: '',
})

// ─── 낱개 입력 폼 ─────────────────────────────────────────
interface SingleFormData {
  date: string; product_id: number | ''; quantity: string
  order_date: string; storage: string; mall: string
  orderer: string; recipient: string; phone: string; address: string; memo: string
}
const SINGLE_INIT: SingleFormData = {
  date: dayjs().format('YYYY-MM-DD'), product_id: '', quantity: '1',
  order_date: dayjs().format('YYYY-MM-DD'), storage: '뉴페이스', mall: '',
  orderer: '', recipient: '', phone: '', address: '', memo: '',
}

function SingleForm({ products }: { products: Product[] }) {
  const [form, setForm]           = useState<SingleFormData>(SINGLE_INIT)
  const [selName, setSelName]     = useState('')
  const [selColor, setSelColor]   = useState('')
  const [selSize, setSelSize]     = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]         = useState('')

  const set = (key: keyof SingleFormData, val: string | number) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const activeProducts = products.filter(p => p.active !== false)
  const names  = [...new Set(activeProducts.map(p => p.name))]
  const colors = selName ? [...new Set(activeProducts.filter(p => p.name === selName).map(p => p.color))] : []
  const sizes  = (selName && selColor)
    ? activeProducts.filter(p => p.name === selName && p.color === selColor).map(p => p.size) : []

  const handleNameChange  = (v: string) => { setSelName(v); setSelColor(''); setSelSize(''); set('product_id', '') }
  const handleColorChange = (v: string) => { setSelColor(v); setSelSize(''); set('product_id', '') }
  const handleSizeChange  = (v: string) => {
    setSelSize(v)
    const found = activeProducts.find(p => p.name === selName && p.color === selColor && p.size === v)
    set('product_id', found?.id ?? '')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.product_id) return
    setError('')
    try {
      await createOrder({ ...form, product_id: form.product_id as number, quantity: Number(form.quantity) })
      setSubmitted(true)
      setTimeout(() => { setSubmitted(false); setForm(SINGLE_INIT); setSelName(''); setSelColor(''); setSelSize('') }, 2000)
    } catch { setError('등록 실패. 다시 시도해주세요.') }
  }

  const sel = (label: string, value: string, onChange: (v: string) => void, options: string[], disabled = false) => (
    <div>
      <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled || options.length === 0}
          className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700
                     focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white disabled:bg-slate-50 disabled:text-slate-400">
          <option value="">선택</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
      </div>
    </div>
  )
  const inp = (label: string, key: keyof SingleFormData, placeholder = '', type = 'text') => (
    <div>
      <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
      <input type={type} value={form[key] as string} onChange={e => set(key, e.target.value)} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700
                   focus:outline-none focus:ring-2 focus:ring-blue-400" />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {submitted && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <CheckCircle size={16} /><span className="text-sm font-medium">발주가 등록되었습니다!</span>
        </div>
      )}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-slate-700 text-sm border-b pb-2">제품 선택</h2>
        <div className="grid grid-cols-3 gap-3">
          {sel('제품명', selName, handleNameChange, names)}
          {sel('색상', selColor, handleColorChange, colors, !selName)}
          {sel('사이즈', selSize, handleSizeChange, sizes, !selColor)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {inp('발주 날짜', 'date', '예) 4.16')}
          {inp('수량', 'quantity', '1', 'number')}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-slate-700 text-sm border-b pb-2">발주 정보</h2>
        <div className="grid grid-cols-3 gap-3">
          {inp('주문일자', 'order_date', '4.16')}
          {inp('제품보관', 'storage', '뉴페이스')}
          {inp('매출(MALL)', 'mall', '해솔앤코')}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-slate-700 text-sm border-b pb-2">수령인 정보</h2>
        <div className="grid grid-cols-2 gap-3">
          {inp('주문자명', 'orderer', '홍길동')}
          {inp('수령인', 'recipient', '홍길동')}
          {inp('수령인 휴대폰', 'phone', '010-0000-0000')}
        </div>
        {inp('주소', 'address', '서울시 강남구 ...')}
        {inp('배송 메모', 'memo', '문 앞에 놔주세요')}
      </div>

      <button type="submit" disabled={!form.product_id}
        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700
                   disabled:bg-slate-200 disabled:text-slate-400 transition-colors">
        발주 등록
      </button>
    </form>
  )
}

// ─── 그리드 대량 발주 ─────────────────────────────────────
function GridOrderForm({ products }: { products: Product[] }) {
  const [date, setDate]         = useState(dayjs().format('YYYY-MM-DD'))
  const [orderDate, setODate]   = useState(dayjs().format('YYYY-MM-DD'))
  const [storage, setStorage]   = useState('뉴페이스')
  const [mall, setMall]         = useState('')
  const [orderer, setOrderer]   = useState('')
  const [recipient, setRecip]   = useState('')
  const [phone, setPhone]       = useState('')
  const [address, setAddress]   = useState('')
  const [memo, setMemo]         = useState('')
  const [quantities, setQty]    = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]     = useState<number | null>(null)

  const grouped = useMemo(() => {
    const g: Record<string, Record<string, Product[]>> = {}
    for (const p of products) {
      if (!g[p.name]) g[p.name] = {}
      if (!g[p.name][p.color]) g[p.name][p.color] = []
      g[p.name][p.color].push(p)
    }
    return g
  }, [products])

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

  const setQ = (id: number, val: string) =>
    setQty(prev => {
      const next = { ...prev }
      if (!val || val === '0') delete next[id]
      else next[id] = val
      return next
    })

  const inp = (label: string, val: string, set: (v: string) => void, ph = '', cls = 'w-28') => (
    <div>
      <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
      <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
        className={`${cls} border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400`} />
    </div>
  )

  const handleSubmit = async () => {
    if (totalItems === 0) return
    setSubmitting(true)
    try {
      const payload = entries.map(([id, qty]) => ({
        date, product_id: Number(id), quantity: Number(qty),
        order_date: orderDate, storage, mall,
        orderer, recipient, phone, address, memo,
      }))
      const res = await createOrdersBulk(payload)
      setResult(res.ok)
      setQty({})
      setTimeout(() => setResult(null), 2500)
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      {/* 공통 설정 */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {inp('발주일', date, setDate, '4.28', 'w-24')}
          {inp('주문일자', orderDate, setODate, '4.28', 'w-24')}
          {inp('보관창고', storage, setStorage, '뉴페이스', 'w-28')}
          {inp('MALL', mall, setMall, '해솔앤코', 'w-28')}
        </div>
        <div className="flex flex-wrap gap-3">
          {inp('주문자', orderer, setOrderer, '홍길동', 'w-24')}
          {inp('수령인', recipient, setRecip, '홍길동', 'w-24')}
          {inp('휴대폰', phone, setPhone, '010-0000-0000', 'w-36')}
          {inp('주소', address, setAddress, '서울시...', 'flex-1 min-w-48')}
          {inp('메모', memo, setMemo, '', 'w-32')}
        </div>
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
                                    ${hasVal ? 'border-blue-300 bg-blue-50 text-blue-700 font-semibold' : 'border-slate-200 text-slate-500'}`}
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
          <CheckCircle size={16} />{result}건 발주 등록 완료
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-400">
          {totalItems > 0 ? `${totalItems}건 발주 예정` : '수량을 입력하세요'}
        </span>
        <button onClick={handleSubmit} disabled={totalItems === 0 || submitting}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700
                     disabled:bg-slate-200 disabled:text-slate-400 transition-colors">
          {submitting ? '등록 중...' : `${totalItems}건 발주 등록`}
        </button>
      </div>
    </div>
  )
}

// ─── 발주 등록 표준 양식 다운로드 ────────────────────────────
function downloadOrderTemplate() {
  const wb = XLSX.utils.book_new()

  const guide = [
    ['야크 재고관리 — 발주 등록 표준 양식 가이드'],
    [],
    ['열 이름', '필수', '형식 / 예시', '설명'],
    ['발주일자', '필수', 'YYYY-MM-DD  예) 2026-04-29', '물건이 출고된 날짜'],
    ['주문일자', '선택', 'YYYY-MM-DD  예) 2026-04-28', '주문이 들어온 날짜 (없으면 발주일자와 동일)'],
    ['제품보관', '선택', '뉴페이스', '창고명 (기본값: 뉴페이스)'],
    ['매출MALL', '선택', '스마트스토어 / 쿠팡 / 해솔앤코 등', '판매 채널'],
    ['주문자명', '선택', '홍길동', '주문한 사람 이름'],
    ['수령인',   '선택', '홍길동', '받는 사람 이름'],
    ['수령인휴대폰', '선택', '010-1234-5678', '수령인 연락처'],
    ['주소', '선택', '서울시 강남구 테헤란로 1', '배송 주소'],
    ['배송메모', '선택', '문 앞에 놔주세요', '배송 요청사항'],
    ['상품명',  '필수', 'H티아고 자켓 블랙 95', '상품명 (색상·사이즈 같이 쓰면 더 정확히 매칭)'],
    ['수량',    '필수', '1', '출고 수량 (숫자만)'],
    [],
    ['주의사항'],
    ['1. 날짜는 반드시 YYYY-MM-DD 형식으로 입력 (예: 2026-04-29)'],
    ['2. 상품명이 정확하지 않아도 자동 매칭됩니다 (색상, 사이즈 함께 입력 권장)'],
    ['3. 헤더 행 포함해서 붙여넣어도 자동으로 건너뜁니다'],
    ['4. 두 번째 시트 "발주양식"에 데이터를 입력하세요'],
  ]
  const wsGuide = XLSX.utils.aoa_to_sheet(guide)
  wsGuide['!cols'] = [{ wch: 14 }, { wch: 6 }, { wch: 32 }, { wch: 32 }]
  XLSX.utils.book_append_sheet(wb, wsGuide, '가이드라인')

  const today = dayjs().format('YYYY-MM-DD')
  const headers = ['발주일자', '주문일자', '제품보관', '매출MALL', '주문자명', '수령인', '수령인휴대폰', '주소', '배송메모', '상품명', '수량']
  const example = [today, today, '뉴페이스', '스마트스토어', '홍길동', '홍길동', '010-1234-5678', '서울시 강남구 테헤란로 1', '문 앞에 놔주세요', 'H티아고 자켓 블랙 95', '1']
  const wsForm = XLSX.utils.aoa_to_sheet([headers, example])
  wsForm['!cols'] = headers.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, wsForm, '발주양식')

  XLSX.writeFile(wb, `발주등록_표준양식_${today}.xlsx`)
}

// ─── 대량 입력 ────────────────────────────────────────────
function BulkForm({ products }: { products: Product[] }) {
  const [subMode, setSubMode]   = useState<'paste' | 'file' | 'grid'>('paste')
  const [pasteText, setPasteText] = useState('')
  const [rows, setRows]         = useState<BulkRow[]>([EMPTY_ROW()])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]     = useState<{ ok: number; fail: number; failRows?: number[]; failItems?: BulkRow[] } | null>(null)
  const [existingOrders, setExistingOrders] = useState<Order[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getOrders({ date: dayjs().format('YYYY-MM-DD') }).then(setExistingOrders).catch(() => {})
  }, [])

  const existingSet = useMemo(() => {
    const s = new Set<string>()
    for (const o of existingOrders) s.add(`${o.product_id}:${o.date}`)
    return s
  }, [existingOrders])

  const activeProducts = products.filter(p => p.active !== false)

  // 제품 매칭: autoMatch → 실패 시 findCandidates
  const matchProduct = (r: BulkRow): Pick<BulkRow, '_resolved' | '_matchType' | '_candidates'> => {
    const text = [r.productName, r.color, r.size].filter(Boolean).join(' ')
    if (!text.trim()) return { _resolved: undefined, _matchType: undefined, _candidates: undefined }

    const auto = autoMatch(text, activeProducts)
    if (auto) {
      return { _resolved: auto.product, _matchType: auto.matchType, _candidates: undefined }
    }
    // autoMatch 실패 → fuzzy 후보
    const candidates = findCandidates(text, activeProducts, 5, 25)
    // fuzzy 100점이면 자동 매칭
    if (candidates.length > 0 && candidates[0].score >= 100) {
      return { _resolved: candidates[0].product, _matchType: 'fuzzy', _candidates: undefined }
    }
    return { _resolved: undefined, _matchType: undefined, _candidates: candidates }
  }

  // 행 검증 (날짜/수량 오류는 _error, 제품 매칭은 matchProduct)
  const validateRows = (rawRows: BulkRow[]): BulkRow[] =>
    rawRows.map(r => {
      if (!r.date) return { ...r, _error: '발주일 필수', _resolved: undefined, _candidates: undefined }
      if (!r.quantity || isNaN(Number(r.quantity)) || Number(r.quantity) < 1)
        return { ...r, _error: '수량 오류', _resolved: undefined, _candidates: undefined }
      return { ...r, _error: undefined, ...matchProduct(r) }
    })

  // 헤더 열 이름 → BulkRow 필드 매핑 테이블
  const HEADER_MAP: Record<string, keyof BulkRow> = {
    '발주일': 'date', '발주일자': 'date',
    '주문일': 'order_date', '주문일자': 'order_date',
    '제품보관': 'storage', '보관': 'storage', '보관창고': 'storage',
    '매출': 'mall', 'mall': 'mall', 'mall명': 'mall', '매출mall': 'mall', '매출(mall)': 'mall',
    '주문자': 'orderer', '주문자명': 'orderer',
    '수령인': 'recipient',
    '수령인휴대폰': 'phone', '휴대폰': 'phone', '연락처': 'phone',
    '주소': 'address', '수령인주소': 'address',
    '배송메모': 'memo', '메모': 'memo', '배송요청': 'memo',
    '상품명': 'productName', '상  품  명': 'productName', '제품명': 'productName',
    '수량': 'quantity',
  }

  // 헤더 기반 자동 매핑 파서
  const parsePaste = (text: string): BulkRow[] => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) return []

    const firstCols = lines[0].split('\t').map(s => s.trim())
    const firstVal  = firstCols[0].toLowerCase().replace(/\s+/g, '')

    // 헤더 행 감지: 첫 셀이 날짜 형식이 아니면 헤더
    const isHeader = !firstVal.match(/^\d+\.\d+$/) && !firstVal.match(/^\d{4}-\d{2}-\d{2}$/)

    // 헤더가 있으면 열 이름으로 매핑, 없으면 기본 위치 기반 매핑
    let colMap: (keyof BulkRow | null)[]

    if (isHeader) {
      colMap = firstCols.map(h => {
        const key = h.toLowerCase().replace(/\s+/g, '')
        return HEADER_MAP[key] ?? HEADER_MAP[h.trim()] ?? null
      })
    } else {
      // 헤더 없는 경우 — 스프레드시트 기본 열 순서
      colMap = [
        'date', 'order_date', 'storage', 'mall', 'orderer',
        null,           // 송하인휴대폰
        'recipient', 'phone',
        null, null,     // 수령인연락처, 우편번호
        'address', 'memo', 'productName', 'quantity',
      ]
    }

    const dataLines = isHeader ? lines.slice(1) : lines

    return dataLines.map(line => {
      const cells = line.split('\t').map(s => s.trim())
      const row: BulkRow = {
        date: '', productName: '', color: '', size: '', quantity: '1',
        order_date: '', storage: '뉴페이스', mall: '', orderer: '',
        recipient: '', phone: '', address: '', memo: '',
      }
      colMap.forEach((field, i) => {
        if (field && cells[i] !== undefined && cells[i] !== '') {
          if (field === 'date' || field === 'order_date') {
            const raw = cells[i]
            const oldFmt = raw.match(/^(\d{1,2})\.(\d{2})$/)
            ;(row as unknown as Record<string, string>)[field] = oldFmt
              ? `${dayjs().year()}-${String(Number(oldFmt[1])).padStart(2,'0')}-${oldFmt[2]}`
              : raw
          } else {
            (row as unknown as Record<string, string>)[field] = cells[i]
          }
        }
      })
      // 날짜 기본값
      if (!row.order_date) row.order_date = row.date
      return row
    })
  }

  const handlePaste = () => {
    const parsed = parsePaste(pasteText)
    if (parsed.length === 0) return
    setRows(validateRows(parsed))
    setPasteText('')
  }

  // 엑셀 파일 파싱
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
      // parsePaste와 동일한 헤더 매핑 로직 재활용
      const raw = data.map(r => r.map(v => String(v ?? '').trim()).join('\t')).join('\n')
      const parsed = parsePaste(raw)
      setRows(validateRows(parsed))
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsBinaryString(file)
  }

  const updateRow = (i: number, key: keyof BulkRow, val: string) => {
    setRows(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [key]: val }
      // 제품명/색상/사이즈 바뀌면 즉시 재매칭
      const r = next[i]
      if (['productName', 'color', 'size'].includes(key as string)) {
        const matchResult = matchProduct(r)
        next[i] = { ...next[i], ...matchResult }
      }
      return next
    })
  }

  // 수동 후보 선택
  const selectCandidate = (i: number, match: MatchResult) => {
    setRows(prev => {
      const next = [...prev]
      next[i] = {
        ...next[i],
        productName: match.product.name,
        color:       match.product.color,
        size:        match.product.size,
        _resolved:   match.product,
        _matchType:  'manual',
        _candidates: undefined,
        _error:      undefined,
      }
      return next
    })
  }

  const clearMatch = (i: number) => {
    setRows(prev => {
      const next = [...prev]
      const r = next[i]
      const text = [r.productName, r.color, r.size].filter(Boolean).join(' ')
      const candidates = text.trim() ? findCandidates(text, activeProducts, 5, 25) : []
      next[i] = { ...next[i], _resolved: undefined, _matchType: undefined, _candidates: candidates, _showSearch: false }
      return next
    })
  }

  const toggleSearch = (i: number) => {
    setRows(prev => {
      const next = [...prev]
      next[i] = { ...next[i], _showSearch: !next[i]._showSearch }
      return next
    })
  }

  const removeRow = (i: number) =>
    setRows(prev => prev.length === 1 ? [EMPTY_ROW()] : prev.filter((_, idx) => idx !== i))

  const addRow = () => setRows(prev => [...prev, EMPTY_ROW()])

  const submitItems = async (items: BulkRow[]) => {
    const payload = items.map(r => ({
      date: r.date, product_id: r._resolved!.id, quantity: Number(r.quantity),
      order_date: r.order_date, storage: r.storage, mall: r.mall,
      orderer: r.orderer, recipient: r.recipient, phone: r.phone,
      address: r.address, memo: r.memo,
    }))
    try {
      const res = await createOrdersBulk(payload)
      const failPids = res.fail.map(f => f.product_id)
      const failItems: BulkRow[] = []
      const usedIndices = new Set<number>()
      for (const pid of failPids) {
        const idx = items.findIndex((r, i) => !usedIndices.has(i) && r._resolved?.id === pid)
        if (idx >= 0) { failItems.push(items[idx]); usedIndices.add(idx) }
      }
      const failRows = failItems.map(r => rows.indexOf(r) + 1)
      return { ok: res.ok, failItems, failRows }
    } catch {
      return { ok: 0, failItems: items, failRows: items.map(r => rows.indexOf(r) + 1) }
    }
  }

  const handleSubmit = async () => {
    const valid = rows.filter(r => r._resolved)
    if (valid.length === 0) return
    setSubmitting(true)
    const { ok, failItems, failRows } = await submitItems(valid)
    setSubmitting(false)
    setResult({ ok, fail: failItems.length, failRows, failItems })
    if (failItems.length === 0) setTimeout(() => { setRows([EMPTY_ROW()]); setResult(null) }, 2500)
  }

  const handleRetry = async () => {
    if (!result?.failItems?.length) return
    setSubmitting(true)
    const { ok, failItems, failRows } = await submitItems(result.failItems)
    setSubmitting(false)
    setResult(prev => ({
      ok: (prev?.ok ?? 0) + ok,
      fail: failItems.length,
      failRows,
      failItems,
    }))
    if (failItems.length === 0) setTimeout(() => { setRows([EMPTY_ROW()]); setResult(null) }, 2500)
  }

  const validCount     = rows.filter(r => r._resolved).length
  const errorCount     = rows.filter(r => r._error).length
  const candidateCount = rows.filter(r => !r._resolved && !r._error && r._candidates !== undefined).length
  const dupCount       = rows.filter(r => r._resolved && existingSet.has(`${r._resolved.id}:${r.date}`)).length
  const hasAnyData     = rows.some(r => r.productName || r.date !== dayjs().format('YYYY-MM-DD'))

  return (
    <div className="space-y-4">

      {/* 대량 입력 서브 모드 */}
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
        <button onClick={() => setSubMode('grid')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${subMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
          <LayoutGrid size={15} />그리드 입력
        </button>
        <button onClick={downloadOrderTemplate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-50 ml-auto">
          <Download size={15} />표준 양식
        </button>
      </div>

      {/* 붙여넣기 영역 */}
      {subMode === 'paste' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1">스프레드시트에서 복사한 데이터를 붙여넣으세요</p>
            <p className="text-xs text-slate-400">
              열 순서: <span className="font-mono bg-slate-50 px-1 rounded">발주일자 · 주문일자 · 제품보관 · 매출MALL · 주문자명 · (송하인폰) · 수령인 · 수령인휴대폰 · (연락처) · (우편번호) · 주소 · 배송메모 · 상품명 · 수량</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">헤더 행 포함 복사해도 자동으로 건너뜁니다 · 상품명은 자동 매칭됩니다</p>
          </div>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            onPaste={e => {
              // timeout 전에 캡처 (currentTarget은 비동기에서 null이 됨)
              const pasteData = e.clipboardData.getData('text')
              setTimeout(() => {
                const parsed = parsePaste(pasteData)
                if (parsed.length > 0) { setRows(validateRows(parsed)); setPasteText('') }
              }, 0)
            }}
            placeholder="여기에 Ctrl+V로 붙여넣기하면 자동으로 파싱됩니다"
            rows={4}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-mono text-slate-700
                       focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          {pasteText && (
            <button onClick={handlePaste}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
              파싱하기
            </button>
          )}
        </div>
      )}

      {/* 파일 업로드 */}
      {subMode === 'file' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
            <Upload size={28} className="text-slate-300" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600">Excel 파일을 선택하거나 드래그하세요</p>
              <p className="text-xs text-slate-400 mt-1">.xlsx, .xls 지원 · 첫 번째 시트 읽기</p>
              <p className="text-xs text-slate-400">열 순서: 발주일자 · 주문일자 · 제품보관 · 매출MALL · 주문자명 · (송하인폰) · 수령인 · 수령인휴대폰 · (연락처) · (우편번호) · 주소 · 배송메모 · 상품명 · 수량</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </label>
        </div>
      )}

      {subMode === 'grid' && <GridOrderForm products={activeProducts} />}

      {/* 붙여넣기/파일 결과 테이블 */}
      {subMode !== 'grid' && <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">{rows.length}행</span>
            {validCount > 0      && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{validCount}개 등록 가능</span>}
            {candidateCount > 0  && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{candidateCount}개 수동 매칭 필요</span>}
            {errorCount > 0      && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">{errorCount}개 오류</span>}
            {dupCount > 0        && <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">⚠ {dupCount}개 중복 주의</span>}
          </div>
          <button onClick={addRow} className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors">
            + 행 추가
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-2 py-2 text-left font-medium text-slate-500 w-8">#</th>
                {BULK_COLS.map(c => (
                  <th key={c.key} className={`px-2 py-2 text-left font-medium text-slate-500 ${c.width}`}>{c.label}</th>
                ))}
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => {
                const hasCandidates = !row._resolved && !row._error && row._candidates !== undefined
                const isAmber = hasCandidates
                const isDup   = !!(row._resolved && existingSet.has(`${row._resolved.id}:${row.date}`))
                return (
                  <Fragment key={i}>
                    <tr className={
                      row._error    ? 'bg-red-50' :
                      isDup         ? 'bg-orange-50/60' :
                      row._resolved ? 'bg-green-50/40' :
                      isAmber       ? 'bg-amber-50/40' : 'bg-white'
                    }>
                      <td className="px-2 py-1.5 text-slate-400 text-center">
                        {row._resolved
                          ? isDup
                            ? <span title="오늘 이미 등록된 발주 있음">⚠</span>
                            : <span className="text-green-500">✓</span>
                          : row._error
                          ? <AlertCircle size={13} className="text-red-400 mx-auto" />
                          : isAmber
                          ? <HelpCircle size={13} className="text-amber-400 mx-auto" />
                          : i + 1}
                      </td>
                      {BULK_COLS.map(c => {
                        const isMatchField = c.key === 'productName' || c.key === 'color' || c.key === 'size'
                        const inputCls = `w-full px-2 py-1 rounded border text-xs focus:outline-none focus:ring-1 ${
                          isMatchField
                            ? row._error    ? 'border-red-300 bg-red-50 focus:ring-red-400'
                            : row._resolved ? 'border-green-300 bg-green-50/40 focus:ring-green-400'
                            : isAmber       ? 'border-amber-300 bg-amber-50/40 focus:ring-amber-400'
                            : 'border-slate-200 bg-white focus:ring-blue-400'
                            : 'border-slate-200 bg-white focus:ring-blue-400'
                        }`
                        return (
                          <td key={c.key} className="px-1 py-1">
                            {/* 매칭 성공 시 제품명 셀 아래에 구조화된 태그 표시 */}
                            {c.key === 'productName' && row._resolved ? (
                              <div className="flex flex-col gap-0.5">
                                <input value={row[c.key] as string} onChange={e => updateRow(i, c.key, e.target.value)}
                                  placeholder={c.placeholder} className={inputCls} />
                                <div className="flex items-center gap-1 px-0.5 flex-wrap">
                                  <span className="text-[10px] text-green-700 font-semibold truncate max-w-[100px]">
                                    {row._resolved.name}
                                  </span>
                                  <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                                    {colorDot(row._resolved.color)}{row._resolved.color}
                                  </span>
                                  <span className="text-[10px] px-1 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">
                                    {row._resolved.size}
                                  </span>
                                  <button onClick={() => clearMatch(i)}
                                    className="ml-auto text-[10px] text-slate-400 hover:text-red-500 transition-colors px-1 rounded">
                                    ✕ 수정
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <input value={row[c.key] as string} onChange={e => updateRow(i, c.key, e.target.value)}
                                placeholder={c.placeholder} className={inputCls} />
                            )}
                          </td>
                        )
                      })}
                      <td className="px-2 py-1.5 text-center">
                        {row._resolved && row._matchType && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium mr-1 ${matchTypeBadge(row._matchType)}`}>
                            {row._matchType === 'manual' ? '수동' : row._matchType}
                          </span>
                        )}
                        <button onClick={() => removeRow(i)} className="text-slate-300 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                    {/* 수동 매칭 후보 선택 행 */}
                    {isAmber && (
                      <tr className="bg-amber-50/60 border-t border-amber-100">
                        <td></td>
                        <td colSpan={BULK_COLS.length + 1} className="px-3 py-2.5 space-y-2">
                          {row._candidates!.length > 0 ? (
                            <>
                              <p className="text-[10px] text-amber-700 font-semibold flex items-center gap-1">
                                <HelpCircle size={11} />
                                자동 매칭 실패 — 아래 후보 중 하나를 선택하세요
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {row._candidates!.map((m, ci) => {
                                  const sl = scoreLabel(m.score)
                                  return (
                                    <button
                                      key={ci}
                                      onClick={() => selectCandidate(i, m)}
                                      className="flex flex-col gap-1 px-3 py-2 bg-white border border-amber-200 rounded-lg hover:border-amber-400 hover:bg-amber-50 hover:shadow-sm transition-all text-left min-w-[130px]"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${sl.color}`}>
                                          {m.score.toFixed(0)}%
                                        </span>
                                        <span className={`text-[10px] font-medium ${sl.color.split(' ')[0]}`}>
                                          {sl.label}
                                        </span>
                                      </div>
                                      <span className="text-xs font-semibold text-slate-800 leading-tight">
                                        {m.product.name}
                                      </span>
                                      <span className="flex items-center gap-1 text-[10px] text-slate-500 leading-tight">
                                        {colorDot(m.product.color)}
                                        {m.product.color}
                                        <span className="px-1 py-0.5 bg-slate-100 rounded font-mono">{m.product.size}</span>
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                            </>
                          ) : (
                            <p className="text-[10px] text-amber-700 font-semibold flex items-center gap-1">
                              <HelpCircle size={11} />
                              자동 매칭 실패 — 후보 없음
                            </p>
                          )}
                          <div>
                            <button onClick={() => toggleSearch(i)}
                              className="text-[10px] text-slate-500 hover:text-blue-600 underline transition-colors">
                              {row._showSearch ? '직접검색 닫기' : '직접검색으로 찾기'}
                            </button>
                            {row._showSearch && (
                              <div className="mt-2">
                                <ProductCascade
                                  products={activeProducts}
                                  onSelect={p => selectCandidate(i, { product: p, score: 100, matchType: 'manual' })}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 오류 행 안내 */}
        {errorCount > 0 && (
          <div className="px-4 py-2 border-t border-red-100 bg-red-50">
            {rows.filter(r => r._error).slice(0, 3).map((r, i) => (
              <p key={i} className="text-xs text-red-600">{r._error}</p>
            ))}
            {errorCount > 3 && <p className="text-xs text-red-400">+{errorCount - 3}개 더...</p>}
          </div>
        )}
      </div>}

      {/* 결과 메시지 */}
      {result && subMode !== 'grid' && (
        <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border text-sm font-medium
          ${result.fail === 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} />
            {result.ok}개 등록 완료
            {result.fail > 0 && ` · ${result.fail}개 실패 (${result.failRows?.map(n => `${n}행`).join(', ')})`}
          </div>
          {result.fail > 0 && (
            <button onClick={handleRetry} disabled={submitting}
              className="px-3 py-1 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50">
              다시하기
            </button>
          )}
        </div>
      )}

      {subMode !== 'grid' && (
        <button
          onClick={handleSubmit}
          disabled={validCount === 0 || submitting || !hasAnyData}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700
                     disabled:bg-slate-200 disabled:text-slate-400 transition-colors">
          {submitting ? `등록 중...` : `${validCount}건 발주 등록`}
        </button>
      )}
    </div>
  )
}

// ─── 바코드 스캐너 발주 ──────────────────────────────────
function BarcodeForm({ products }: { products: Product[] }) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const [buffer, setBuffer]   = useState('')
  const [date, setDate]       = useState(dayjs().format('YYYY-MM-DD'))
  const [storage, setStorage] = useState('뉴페이스')
  const [mall, setMall]       = useState('')
  // 스캔된 항목: { product, qty }
  const [scanned, setScanned] = useState<{ product: Product; qty: number }[]>([])
  const [lastScan, setLastScan] = useState<{ product: Product; ok: boolean } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  // barcode → product 맵 (barcode 우선, 없으면 model_code fallback)
  const codeMap = useMemo(() => {
    const m: Record<string, Product> = {}
    for (const p of products) {
      if (p.model_code) m[p.model_code.trim().toUpperCase()] = p
    }
    for (const p of products) {
      if (p.barcode) m[p.barcode.trim().toUpperCase()] = p  // barcode가 우선
    }
    return m
  }, [products])

  const handleScan = (code: string) => {
    const key = code.trim().toUpperCase()
    const product = codeMap[key]
    if (!product) {
      setLastScan({ product: { id: -1, name: code, color: '', size: '', model_code: code, barcode: '', active: false }, ok: false })
      return
    }
    setLastScan({ product, ok: true })
    setScanned(prev => {
      const idx = prev.findIndex(s => s.product.id === product.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { product, qty: 1 }]
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (buffer.trim()) {
        handleScan(buffer.trim())
        setBuffer('')
      }
    }
  }

  const removeItem = (idx: number) => setScanned(prev => prev.filter((_, i) => i !== idx))
  const adjustQty  = (idx: number, delta: number) => setScanned(prev => {
    const next = [...prev]
    const newQty = next[idx].qty + delta
    if (newQty <= 0) return prev.filter((_, i) => i !== idx)
    next[idx] = { ...next[idx], qty: newQty }
    return next
  })

  const totalCount = scanned.reduce((s, r) => s + r.qty, 0)

  const handleSubmit = async () => {
    if (scanned.length === 0) return
    setSubmitting(true)
    try {
      const orders = scanned.map(({ product, qty }) => ({
        date, product_id: product.id, quantity: qty,
        order_date: date, storage, mall,
        orderer: '', recipient: '', phone: '', address: '', memo: '',
      }))
      await Promise.all(orders.map(o => createOrder(o)))
      setResult(`${totalCount}건 등록 완료`)
      setScanned([])
      setTimeout(() => setResult(null), 2500)
    } catch {
      setResult('등록 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4" onClick={() => inputRef.current?.focus()}>
      {/* 숨겨진 스캔 입력 */}
      <input
        ref={inputRef}
        value={buffer}
        onChange={e => setBuffer(e.target.value)}
        onKeyDown={handleKeyDown}
        className="opacity-0 absolute w-0 h-0"
        autoFocus
      />

      {/* 스캔 영역 */}
      <div className="bg-slate-800 text-white rounded-xl p-5 text-center space-y-2 cursor-pointer select-none"
        onClick={() => inputRef.current?.focus()}>
        <div className="text-3xl">📷</div>
        <p className="font-semibold text-sm">바코드를 스캐너로 스캔하세요</p>
        <p className="text-xs text-slate-400">이 영역 클릭 후 스캔 · USB 스캐너 자동 감지</p>
        {buffer && (
          <div className="mt-2 px-3 py-1.5 bg-slate-700 rounded-lg font-mono text-xs text-blue-300">
            {buffer}▌
          </div>
        )}
      </div>

      {/* 마지막 스캔 결과 */}
      {lastScan && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium
          ${lastScan.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
          {lastScan.ok ? (
            <>
              <CheckCircle size={16} />
              <span>{lastScan.product.name} / {lastScan.product.color} / {lastScan.product.size} +1</span>
            </>
          ) : (
            <>
              <AlertCircle size={16} />
              <span>코드 "{lastScan.product.model_code}" 미등록 제품</span>
            </>
          )}
        </div>
      )}

      {/* 날짜/창고 설정 */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">발주일</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">창고</label>
          <input value={storage} onChange={e => setStorage(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-28" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">매출몰</label>
          <input value={mall} onChange={e => setMall(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-28" />
        </div>
      </div>

      {/* 스캔 목록 */}
      {scanned.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">스캔 목록</span>
            <span className="text-xs text-slate-400">총 {totalCount}개</span>
          </div>
          <div className="divide-y divide-slate-50">
            {scanned.map(({ product, qty }, idx) => (
              <div key={product.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{product.name}</p>
                  <p className="text-xs text-slate-400">{product.color} / {product.size}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => adjustQty(idx, -1)}
                    className="w-7 h-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-bold">−</button>
                  <span className="w-8 text-center font-bold text-slate-800">{qty}</span>
                  <button onClick={() => adjustQty(idx, 1)}
                    className="w-7 h-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-bold">＋</button>
                  <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-400 ml-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
          <CheckCircle size={16} />{result}
        </div>
      )}

      <button onClick={handleSubmit} disabled={scanned.length === 0 || submitting}
        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700
                   disabled:bg-slate-200 disabled:text-slate-400 transition-colors">
        {submitting ? '등록 중...' : `${totalCount}건 발주 등록`}
      </button>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────
export default function OrderInput() {
  const [mode, setMode]         = useState<'single' | 'bulk' | 'barcode'>('single')
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => { getProducts().then(setProducts) }, [])

  return (
    <div className="p-3 md:p-6">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">발주 입력</h1>
      <p className="text-sm text-slate-400 mb-5">낱개 또는 대량으로 발주를 등록하세요</p>

      {/* 모드 탭 */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-6">
        <button onClick={() => setMode('single')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors
            ${mode === 'single' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          낱개 입력
        </button>
        <button onClick={() => setMode('bulk')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors
            ${mode === 'bulk' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          대량 입력
        </button>
        <button onClick={() => setMode('barcode')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors
            ${mode === 'barcode' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          바코드
        </button>
      </div>

      {mode === 'single'  && <SingleForm products={products} />}
      {mode === 'bulk'    && <BulkForm   products={products} />}
      {mode === 'barcode' && <BarcodeForm products={products} />}
    </div>
  )
}
