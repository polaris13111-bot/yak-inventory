import { useState, useEffect } from 'react'
import { AlertTriangle, TrendingDown, Package, ShoppingCart } from 'lucide-react'
import dayjs from 'dayjs'
import { getStockSummary, getOrders } from '../api'
import type { StockSummary, Order } from '../types'

export default function Dashboard() {
  const today = dayjs()
  const monthStr = String(today.month() + 1)
  const todayStr = today.format('M.DD')

  const [summaryAll, setSummaryAll]     = useState<StockSummary[]>([])   // 누적 재고 (부족 판단용)
  const [summaryMonth, setSummaryMonth] = useState<StockSummary[]>([])   // 이달 집계 (총출고용)
  const [todayOrders, setTodayOrders]   = useState<Order[]>([])
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    Promise.all([
      getStockSummary(),           // 전체 누적 — 실제 현재고 계산
      getStockSummary(monthStr),   // 이달 — 월 출고량 계산
      getOrders({ date: todayStr }),
    ]).then(([all, monthly, orders]) => {
      setSummaryAll(all)
      setSummaryMonth(monthly)
      setTodayOrders(orders)
    }).finally(() => setLoading(false))
  }, [])

  const lowStock  = summaryAll.filter(s => s.current_stock < 1)
  const warnStock = summaryAll.filter(s => s.current_stock >= 1 && s.current_stock <= 3)
  const totalOut  = summaryMonth.reduce((acc, s) => acc + s.total_out, 0)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">대시보드</h1>
        <p className="text-sm text-slate-400 mt-1">{today.format('YYYY년 M월 D일')}</p>
      </div>

      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '오늘 출고', value: `${todayOrders.length}건`, icon: ShoppingCart, color: 'bg-blue-50 text-blue-600' },
          { label: '이달 총 출고', value: `${totalOut}개`, icon: Package, color: 'bg-green-50 text-green-600' },
          { label: '재고 부족', value: `${lowStock.length}개`, icon: TrendingDown, color: 'bg-red-50 text-red-600' },
          { label: '재고 경고', value: `${warnStock.length}개`, icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '...' : value}</p>
              </div>
              <div className={`p-3 rounded-lg ${color}`}>
                <Icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">

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
