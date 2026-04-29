import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Printer, ChevronLeft, ChevronRight, ScanBarcode, List, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import dayjs from 'dayjs'
import { getOrders, getProducts } from '../api'
import type { Order, Product } from '../types'

// ─── 경고음 (Web Audio API) ──────────────────────────────
function playBeep(type: 'ok' | 'error' | 'done') {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    if (type === 'done') {
      // 완료: 높은 더블 비프
      osc.frequency.value = 1046
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
      osc.start()
      osc.stop(ctx.currentTime + 0.1)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.frequency.value = 1318
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.12)
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc2.start(ctx.currentTime + 0.12)
      osc2.stop(ctx.currentTime + 0.25)
    } else if (type === 'ok') {
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
    } else {
      // error: 낮은 긴 비프
      osc.type = 'sawtooth'
      osc.frequency.value = 220
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start()
      osc.stop(ctx.currentTime + 0.5)
    }
  } catch { /* 브라우저 미지원 시 무시 */ }
}

// ─── 검수 모드 ────────────────────────────────────────────
interface CheckRow {
  product: Product
  target: number   // 발주 수량
  remaining: number
}

function CheckMode({ pickRows, products }: {
  pickRows: { product: Product; qty: number }[]
  products: Product[]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [buffer, setBuffer] = useState('')
  const [rows, setRows] = useState<CheckRow[]>([])
  const [lastScan, setLastScan] = useState<{ name: string; ok: boolean; msg: string } | null>(null)

  // 초기화: pickRows → CheckRow[]
  useEffect(() => {
    setRows(pickRows.map(r => ({ product: r.product, target: r.qty, remaining: r.qty })))
    setLastScan(null)
  }, [pickRows])

  // barcode / model_code → product 맵 (오늘 발주 상품만)
  const codeMap = useMemo(() => {
    const m: Record<string, Product> = {}
    for (const p of products) {
      if (p.model_code) m[p.model_code.trim().toUpperCase()] = p
    }
    for (const p of products) {
      if (p.barcode) m[p.barcode.trim().toUpperCase()] = p
    }
    return m
  }, [products])

  const handleScan = useCallback((code: string) => {
    const key = code.trim().toUpperCase()
    const product = codeMap[key]

    if (!product) {
      playBeep('error')
      setLastScan({ name: code, ok: false, msg: `"${code}" — 등록되지 않은 바코드` })
      return
    }

    setRows(prev => {
      const idx = prev.findIndex(r => r.product.id === product.id)
      if (idx < 0) {
        // 오늘 피킹 목록에 없는 상품
        playBeep('error')
        setLastScan({ name: product.name, ok: false, msg: `${product.name} ${product.color} ${product.size} — 오늘 피킹 목록에 없는 상품! 오배송 주의` })
        return prev
      }
      const row = prev[idx]
      if (row.remaining <= 0) {
        playBeep('error')
        setLastScan({ name: product.name, ok: false, msg: `${product.name} ${product.color} ${product.size} — 이미 완료된 상품` })
        return prev
      }
      const next = [...prev]
      const newRemaining = row.remaining - 1
      next[idx] = { ...row, remaining: newRemaining }
      if (newRemaining === 0) {
        playBeep('done')
        setLastScan({ name: product.name, ok: true, msg: `✓ ${product.name} ${product.color} ${product.size} — 완료!` })
      } else {
        playBeep('ok')
        setLastScan({ name: product.name, ok: true, msg: `${product.name} ${product.color} ${product.size} — 남은 수량: ${newRemaining}개` })
      }
      return next
    })
  }, [codeMap])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (buffer.trim()) {
        handleScan(buffer.trim())
        setBuffer('')
      }
    }
  }

  const reset = () => {
    setRows(pickRows.map(r => ({ product: r.product, target: r.qty, remaining: r.qty })))
    setLastScan(null)
  }

  const totalTarget = rows.reduce((s, r) => s + r.target, 0)
  const totalDone   = rows.reduce((s, r) => s + (r.target - r.remaining), 0)
  const allDone     = rows.length > 0 && rows.every(r => r.remaining === 0)
  const progress    = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0

  if (pickRows.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 text-sm">
        이 날짜의 발주 내역이 없습니다
      </div>
    )
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

      {/* 스캔 안내 + 진행률 */}
      <div className={`rounded-xl p-4 text-white cursor-pointer select-none transition-colors
        ${allDone ? 'bg-green-600' : 'bg-slate-800'}`}
        onClick={() => inputRef.current?.focus()}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ScanBarcode size={18} />
            <span className="font-semibold text-sm">
              {allDone ? '✓ 피킹 완료!' : '바코드를 스캔하세요'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold">{totalDone} / {totalTarget}개</span>
            <button onClick={e => { e.stopPropagation(); reset() }}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
        {/* 진행률 바 */}
        <div className="w-full bg-white/20 rounded-full h-2">
          <div className="bg-white rounded-full h-2 transition-all duration-300"
            style={{ width: `${progress}%` }} />
        </div>
        <p className="text-right text-xs text-white/60 mt-1">{progress}%</p>
        {buffer && (
          <div className="mt-2 px-3 py-1.5 bg-white/10 rounded-lg font-mono text-xs text-blue-300">
            {buffer}▌
          </div>
        )}
      </div>

      {/* 마지막 스캔 결과 */}
      {lastScan && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm font-medium
          ${lastScan.ok
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-600'}`}>
          {lastScan.ok
            ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            : <AlertCircle  size={16} className="mt-0.5 flex-shrink-0" />}
          <span>{lastScan.msg}</span>
        </div>
      )}

      {/* 피킹 체크 테이블 */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold w-8">#</th>
              <th className="px-4 py-3 text-left font-semibold">제품</th>
              <th className="px-4 py-3 text-right font-semibold w-20">목표</th>
              <th className="px-4 py-3 text-right font-semibold w-20">남은</th>
              <th className="px-4 py-3 text-center font-semibold w-20">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ product, target, remaining }, idx) => {
              const done = remaining === 0
              return (
                <tr key={product.id}
                  className={`transition-colors ${done ? 'bg-green-50/50' : 'hover:bg-slate-50/50'}`}>
                  <td className="px-4 py-3 text-xs text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className={`font-medium ${done ? 'text-green-700' : 'text-slate-800'}`}>
                      {product.name}
                    </p>
                    <p className="text-xs text-slate-400">{product.color} / {product.size}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{target}</td>
                  <td className={`px-4 py-3 text-right font-bold text-lg
                    ${done ? 'text-green-600' : remaining <= Math.ceil(target * 0.3) ? 'text-amber-600' : 'text-slate-800'}`}>
                    {remaining}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {done
                      ? <span className="text-green-600 font-bold text-xs">✓ 완료</span>
                      : <div className="w-full bg-slate-100 rounded-full h-1.5 mx-auto max-w-[48px]">
                          <div className="bg-blue-500 rounded-full h-1.5 transition-all"
                            style={{ width: `${((target - remaining) / target) * 100}%` }} />
                        </div>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── 메인 ─────────────────────────────────────────────────
export default function PickingList() {
  const [tab, setTab]             = useState<'list' | 'check'>('list')
  const [date, setDate]           = useState(dayjs().format('YYYY-MM-DD'))
  const [orders, setOrders]       = useState<Order[]>([])
  const [products, setProducts]   = useState<Product[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([getOrders({ date }), getProducts()])
      .then(([o, p]) => { setOrders(o); setProducts(p) })
      .finally(() => setLoading(false))
  }, [date])

  const productMap = useMemo(() => {
    const m: Record<number, Product> = {}
    for (const p of products) m[p.id] = p
    return m
  }, [products])

  // 제품별 합산
  const pickRows = useMemo(() => {
    const totals: Record<number, number> = {}
    for (const o of orders) {
      totals[o.product_id] = (totals[o.product_id] ?? 0) + o.quantity
    }
    return Object.entries(totals)
      .map(([pid, qty]) => ({ product: productMap[Number(pid)], qty }))
      .filter(r => r.product)
      .sort((a, b) => a.product.name.localeCompare(b.product.name, 'ko'))
  }, [orders, productMap])

  const totalQty = pickRows.reduce((s, r) => s + r.qty, 0)

  const prevDay = () => setDate(d => dayjs(d).subtract(1, 'day').format('YYYY-MM-DD'))
  const nextDay = () => setDate(d => dayjs(d).add(1, 'day').format('YYYY-MM-DD'))

  return (
    <div className="p-3 md:p-6">
      {/* 화면 헤더 (인쇄 시 숨김) */}
      <div className="print:hidden mb-5 flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">피킹 리스트</h1>
          <p className="text-sm text-slate-400">창고 작업자용 일별 출고 목록</p>
        </div>
        <div className="md:ml-auto flex items-center gap-2 flex-wrap">
          {/* 날짜 이동 */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <button onClick={prevDay} className="p-1 hover:bg-slate-100 rounded transition-colors">
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm font-medium text-slate-700 focus:outline-none"
            />
            <button onClick={nextDay} className="p-1 hover:bg-slate-100 rounded transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          {/* 탭 전환 */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            <button onClick={() => setTab('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${tab === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <List size={13} />목록
            </button>
            <button onClick={() => setTab('check')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${tab === 'check' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <ScanBarcode size={13} />검수
            </button>
          </div>
          {tab === 'list' && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
              <Printer size={15} />인쇄
            </button>
          )}
        </div>
      </div>

      {/* 검수 모드 */}
      {tab === 'check' && !loading && (
        <CheckMode pickRows={pickRows} products={products} />
      )}

      {/* 피킹 목록 모드 */}
      {tab === 'list' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm print:shadow-none print:border-none print:rounded-none">
          {/* 문서 헤더 */}
          <div className="px-6 py-5 border-b border-slate-100 print:border-slate-300">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800 print:text-xl">피킹 리스트</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {dayjs(date).format('YYYY년 M월 D일 (ddd)')} 출고 건
                </p>
              </div>
              <div className="text-right text-sm text-slate-500">
                <p>총 <span className="font-bold text-slate-800 text-base">{totalQty}</span>개</p>
                <p>{pickRows.length}종류</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">불러오는 중...</div>
          ) : pickRows.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">이 날짜의 발주 내역이 없습니다</div>
          ) : (
            <>
              {/* 피킹 테이블 */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 print:bg-gray-100 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold w-8">#</th>
                    <th className="px-4 py-3 text-left font-semibold">제품명</th>
                    <th className="px-4 py-3 text-left font-semibold">색상</th>
                    <th className="px-4 py-3 text-left font-semibold">사이즈</th>
                    <th className="px-4 py-3 text-right font-semibold w-20">수량</th>
                    <th className="px-4 py-3 text-center font-semibold w-16 print:block hidden">확인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 print:divide-gray-200">
                  {pickRows.map(({ product, qty }, idx) => (
                    <tr key={product.id} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                      <td className="px-4 py-3 text-xs text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{product.name}</td>
                      <td className="px-4 py-3 text-slate-600">{product.color}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono">{product.size}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 text-base">{qty}</td>
                      <td className="px-4 py-3 text-center print:block hidden">
                        <span className="inline-block w-5 h-5 border-2 border-slate-400 rounded" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 print:border-gray-400 bg-slate-50 print:bg-gray-100">
                    <td colSpan={4} className="px-4 py-3 font-bold text-slate-700 text-right">합계</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600 print:text-gray-800 text-lg">{totalQty}</td>
                    <td className="print:block hidden" />
                  </tr>
                </tfoot>
              </table>

              {/* 주문별 상세 */}
              {orders.length > 0 && (
                <div className="mt-6 px-6 pb-6 print:mt-8">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    상세 발주 내역 ({orders.length}건)
                  </h3>
                  <table className="w-full text-xs border border-slate-100 print:border-gray-300 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50 print:bg-gray-100 text-slate-500">
                        <th className="px-3 py-2 text-left font-semibold">제품</th>
                        <th className="px-3 py-2 text-left font-semibold">수량</th>
                        <th className="px-3 py-2 text-left font-semibold">수령인</th>
                        <th className="px-3 py-2 text-left font-semibold">연락처</th>
                        <th className="px-3 py-2 text-left font-semibold">매출몰</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 print:divide-gray-200">
                      {orders.map(o => {
                        const p = productMap[o.product_id]
                        return (
                          <tr key={o.id}>
                            <td className="px-3 py-2 text-slate-700">
                              {p ? `${p.name} ${p.color} ${p.size}` : `제품#${o.product_id}`}
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-800">{o.quantity}</td>
                            <td className="px-3 py-2 text-slate-600">{o.recipient || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{o.phone || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{o.mall || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 인쇄 전용 스타일 */}
      <style>{`
        @media print {
          body { font-size: 12px; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
        }
        @media screen {
          .print\\:block { display: none; }
        }
      `}</style>
    </div>
  )
}
