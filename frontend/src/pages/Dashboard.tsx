import { useState, useEffect } from 'react'
import { AlertTriangle, TrendingDown, Package, ShoppingCart, PackageCheck } from 'lucide-react'
import dayjs from 'dayjs'
import { getStockSummary, getOrders, getInventory } from '../api'
import type { StockSummary, Order, InventoryItem } from '../types'

export default function Dashboard() {
  const today        = dayjs()
  const monthStr     = today.format('YYYY-MM')
  const prevMonthStr = today.subtract(1, 'month').format('YYYY-MM')
  const todayStr     = today.format('YYYY-MM-DD')

  const [summaryAll, setSummaryAll]         = useState<StockSummary[]>([])
  const [summaryMonth, setSummaryMonth]     = useState<StockSummary[]>([])
  const [summaryPrev, setSummaryPrev]       = useState<StockSummary[]>([])
  const [todayOrders, setTodayOrders]       = useState<Order[]>([])
  const [monthInventory, setMonthInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(false)

  useEffect(() => {
    Promise.all([
      getStockSummary(),
      getStockSummary(monthStr),
      getStockSummary(prevMonthStr),
      getOrders({ date: todayStr }),
      getInventory({ month: monthStr }),
    ]).then(([all, monthly, prev, orders, inv]) => {
      setSummaryAll(all)
      setSummaryMonth(monthly)
      setSummaryPrev(prev)
      setTodayOrders(orders)
      setMonthInventory(inv)
    }).catch(() => setError(true))
    .finally(() => setLoading(false))
  }, [])

  const lowStock  = summaryAll.filter(s => s.current_stock < 1)
  const totalOut  = summaryMonth.reduce((acc, s) => acc + s.total_out, 0)
  const prevOut   = summaryPrev.reduce((acc, s) => acc + s.total_out, 0)
  const monthIn   = monthInventory.reduce((acc, i) => acc + i.quantity, 0)
  const pctChange = prevOut > 0 ? ((totalOut - prevOut) / prevOut * 100) : null

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">대시보드</h1>
        <p className="text-sm text-slate-400 mt-1">{today.format('YYYY년 M월 D일')}</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          데이터 로드에 실패했습니다. 페이지를 새로고침 해주세요.
        </div>
      )}

      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* 오늘 출고 */}
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">오늘 출고</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '...' : `${todayOrders.length}건`}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 text-blue-600"><ShoppingCart size={20} /></div>
          </div>
        </div>
        {/* 이달 총 출고 + 전달 대비 */}
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">이달 총 출고</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '...' : `${totalOut}개`}</p>
              {!loading && pctChange !== null && (
                <p className={`text-xs mt-0.5 font-medium ${pctChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  전달 대비 {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(0)}%
                </p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-green-50 text-green-600"><Package size={20} /></div>
          </div>
        </div>
        {/* 재고 부족 */}
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">재고 부족</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '...' : `${lowStock.length}개`}</p>
            </div>
            <div className="p-3 rounded-lg bg-red-50 text-red-600"><TrendingDown size={20} /></div>
          </div>
        </div>
        {/* 이달 입고 */}
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">이달 입고</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '...' : `${monthIn}개`}</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-50 text-purple-600"><PackageCheck size={20} /></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

        {/* 재고 부족 알림 */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            <h2 className="font-semibold text-slate-700 text-sm">재고 부족 항목</h2>
          </div>
          <div className="p-4 space-y-2 max-h-72 overflow-auto">
            {loading ? (
              <p className="text-sm text-slate-400 text-center py-4">로딩 중...</p>
            ) : lowStock.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">재고 부족 없음</p>
            ) : lowStock.map(s => (
              <div key={s.product.id} className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-700">{s.product.name}</p>
                  <p className="text-xs text-slate-400">{s.product.color} / {s.product.size}</p>
                </div>
                <span className={`text-sm font-bold ${s.current_stock < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  현재고 {s.current_stock}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 오늘 발주 */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <ShoppingCart size={16} className="text-blue-500" />
            <h2 className="font-semibold text-slate-700 text-sm">오늘 발주 ({todayStr})</h2>
          </div>
          <div className="p-4 space-y-2 max-h-72 overflow-auto">
            {loading ? (
              <p className="text-sm text-slate-400 text-center py-4">로딩 중...</p>
            ) : todayOrders.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">오늘 발주 없음</p>
            ) : todayOrders.map(o => (
              <div key={o.id} className="flex items-center justify-between py-2 px-3 bg-blue-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {o.product ? `${o.product.name} / ${o.product.color} / ${o.product.size}` : `제품 #${o.product_id}`}
                  </p>
                  {o.recipient && <p className="text-xs text-slate-400">수령인: {o.recipient}</p>}
                </div>
                <span className="text-sm font-bold text-blue-600">×{o.quantity}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
