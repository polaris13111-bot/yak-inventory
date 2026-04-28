import { useState, useEffect, useMemo } from 'react'
import { Printer, ChevronLeft, ChevronRight } from 'lucide-react'
import dayjs from 'dayjs'
import { getOrders, getProducts } from '../api'
import type { Order, Product } from '../types'

export default function PickingList() {
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

  const handlePrint = () => window.print()

  return (
    <div className="p-3 md:p-6">
      {/* 화면 헤더 (인쇄시 숨김) */}
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
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
            <Printer size={15} />인쇄
          </button>
        </div>
      </div>

      {/* 인쇄 용지 */}
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
                    {/* 인쇄 시 체크박스 표시 */}
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

            {/* 주문별 상세 (인쇄 시 추가 정보) */}
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
