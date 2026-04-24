import { useState, useEffect, useMemo } from 'react'
import { Search, AlertCircle, RefreshCw } from 'lucide-react'
import { getStockSummary } from '../api'
import type { StockSummary } from '../types'
import { getColorHex } from '../utils/colors'

export default function StockStatus() {
  const [stock, setStock]       = useState<StockSummary[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch]     = useState('')
  const [lowOnly, setLowOnly]   = useState(false)

  const load = () => {
    setLoading(true)
    setLoadError(false)
    getStockSummary()
      .then(setStock)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const filtered = useMemo(() => {
    let items = stock
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(s =>
        s.product.name.toLowerCase().includes(q) ||
        s.product.color.toLowerCase().includes(q) ||
        s.product.size.toLowerCase().includes(q)
      )
    }
    if (lowOnly) items = items.filter(s => s.low_stock || s.current_stock <= 0)
    return items
  }, [stock, search, lowOnly])

  const totalStock = stock.reduce((s, x) => s + x.current_stock, 0)
  const zeroCount  = stock.filter(s => s.current_stock <= 0).length
  const lowCount   = stock.filter(s => s.low_stock && s.current_stock > 0).length

  return (
    <div className="p-6 space-y-5 overflow-auto h-full">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">현재 재고</h1>
          <p className="text-sm text-slate-400 mt-0.5">전체 SKU 기준 누적 입고 − 출고</p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600 disabled:opacity-40">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loadError ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          데이터 로드에 실패했습니다.
          <button onClick={load} className="ml-2 underline">다시 시도</button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-60 text-slate-400 text-sm">로딩 중...</div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: '전체 SKU',  value: `${stock.length}종`,               color: 'text-slate-800' },
              { label: '총 재고',   value: `${totalStock.toLocaleString()}개`, color: 'text-blue-600' },
              { label: '재고 부족', value: lowCount  > 0 ? `${lowCount}종`  : '없음', color: lowCount  > 0 ? 'text-amber-600' : 'text-emerald-600' },
              { label: '품절',      value: zeroCount > 0 ? `${zeroCount}종` : '없음', color: zeroCount > 0 ? 'text-red-600'   : 'text-emerald-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* 필터 */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="제품명, 색상, 사이즈 검색"
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <button onClick={() => setLowOnly(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors
                ${lowOnly
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <AlertCircle size={14} />
              부족·품절만
            </button>
            <span className="text-xs text-slate-400">{filtered.length}개 표시 중</span>
          </div>

          {/* 테이블 */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">제품명</th>
                  <th className="px-4 py-3 text-left">색상</th>
                  <th className="px-4 py-3 text-left">사이즈</th>
                  <th className="px-4 py-3 text-right">총 입고</th>
                  <th className="px-4 py-3 text-right">총 출고</th>
                  <th className="px-4 py-3 text-right">현재고</th>
                  <th className="px-4 py-3 text-center">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(s => {
                  const isZero = s.current_stock <= 0
                  const isLow  = !isZero && s.low_stock
                  return (
                    <tr key={s.product.id}
                      className={isZero ? 'bg-red-50/40' : isLow ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{s.product.name}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/10"
                            style={{ background: getColorHex(s.product.color) }} />
                          {s.product.color}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{s.product.size}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{s.total_in}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{s.total_out}</td>
                      <td className={`px-4 py-2.5 text-right font-bold text-base
                        ${isZero ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-800'}`}>
                        {s.current_stock}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isZero
                          ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">품절</span>
                          : isLow
                          ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">부족</span>
                          : <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">정상</span>
                        }
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center text-slate-400 text-sm">
                      {search || lowOnly ? '검색 결과가 없습니다' : '재고 데이터가 없습니다'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
