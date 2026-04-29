import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, PackageCheck } from 'lucide-react'
import dayjs from 'dayjs'
import { getInventory } from '../api'
import type { InventoryItem } from '../types'
import { getColorHex } from '../utils/colors'

export default function InboundStatus() {
  const [month, setMonth]   = useState(dayjs().month() + 1)
  const [year]              = useState(dayjs().year())
  const [items, setItems]   = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const monthStr = `${year}-${String(month).padStart(2,'0')}`

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    getInventory({ month: monthStr })
      .then(setItems)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [monthStr])

  // 날짜별 그룹
  const grouped = useMemo(() => {
    const map: Record<string, InventoryItem[]> = {}
    for (const it of items) {
      if (!map[it.date]) map[it.date] = []
      map[it.date].push(it)
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a))
  }, [items])

  const totalQty       = items.reduce((s, it) => s + it.quantity, 0)
  const returnCount    = items.filter(it => it.type === 'return').length
  const defectiveCount = items.filter(it => it.type === 'defective').length

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5 overflow-auto h-full">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">입고 현황</h1>
          <p className="text-sm text-slate-400 mt-0.5">월별 입고 내역 조회</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(m => Math.max(1, m - 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronLeft size={17} />
          </button>
          <span className="text-sm font-bold text-slate-700 w-20 text-center">{year}년 {month}월</span>
          <button onClick={() => setMonth(m => Math.min(12, m + 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          데이터 로드에 실패했습니다. 페이지를 새로고침 해주세요.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-60 text-slate-400 text-sm">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 text-slate-300 gap-2">
          <PackageCheck size={36} />
          <p className="text-sm">이번 달 입고 내역이 없습니다</p>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: '총 입고 건수',  value: `${items.length}건`,  color: 'text-slate-800' },
              { label: '총 입고 수량',  value: `${totalQty}개`,      color: 'text-blue-600'  },
              { label: '변심반품',      value: returnCount > 0    ? `${returnCount}건`    : '없음',
                color: returnCount    > 0 ? 'text-amber-600'    : 'text-emerald-600' },
              { label: '불량 입고',     value: defectiveCount > 0 ? `${defectiveCount}건` : '없음',
                color: defectiveCount > 0 ? 'text-red-600'      : 'text-emerald-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* 날짜별 그룹 */}
          <div className="space-y-4">
            {grouped.map(([date, dayItems]) => (
              <div key={date} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">{date}</span>
                  <span className="text-xs text-slate-400">
                    {dayItems.length}건 · {dayItems.reduce((s, it) => s + it.quantity, 0)}개
                  </span>
                </div>
                {/* 데스크톱: 테이블 / 모바일: 카드 리스트 */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: '580px' }}>
                    <tbody className="divide-y divide-slate-100">
                      {dayItems.map(it => (
                        <tr key={it.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                            {it.product?.name ?? `#${it.product_id}`}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {it.product && (
                              <span className="flex items-center gap-1.5 text-slate-600 text-xs">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/10"
                                  style={{ background: getColorHex(it.product.color) }} />
                                {it.product.color}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs font-mono whitespace-nowrap w-12">
                            {it.product?.size}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap w-16">
                            {it.quantity}개
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap w-20">
                            {it.type === 'return'
                              ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">변심반품</span>
                              : it.type === 'defective'
                              ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">불량</span>
                              : <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">정상</span>
                            }
                          </td>
                          <td className="px-3 py-2.5 w-48">
                            <div className="text-xs text-slate-400 truncate max-w-[180px]">{it.notes}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* 모바일 카드 */}
                <div className="md:hidden divide-y divide-slate-100">
                  {dayItems.map(it => (
                    <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">
                            {it.product?.name ?? `#${it.product_id}`}
                          </span>
                          {it.product && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <span className="w-2 h-2 rounded-full ring-1 ring-black/10 flex-shrink-0"
                                style={{ background: getColorHex(it.product.color) }} />
                              {it.product.color} / {it.product.size}
                            </span>
                          )}
                        </div>
                        {it.notes ? <p className="text-xs text-slate-400 truncate mt-0.5">{it.notes}</p> : null}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {it.type === 'return'
                          ? <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">반품</span>
                          : it.type === 'defective'
                          ? <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">불량</span>
                          : null
                        }
                        <span className="text-sm font-bold text-slate-800">{it.quantity}개</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
