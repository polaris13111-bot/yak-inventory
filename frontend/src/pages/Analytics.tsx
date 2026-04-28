import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, BarChart2, TrendingUp, X } from 'lucide-react'
import dayjs from 'dayjs'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
  PieChart, Pie,
} from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import { getProducts, getDailyOutbound } from '../api'
import type { Product, DailyOutbound } from '../types'
import { getColorHex } from '../utils/colors'

const CHART_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#6366f1',
  '#14b8a6','#eab308','#e11d48','#7c3aed','#0ea5e9',
]

export default function Analytics() {
  const [month, setMonth]               = useState(dayjs().month() + 1)
  const [year]                          = useState(dayjs().year())
  const [products, setProducts]         = useState<Product[]>([])
  const [outbound, setOutbound]         = useState<DailyOutbound[]>([])
  const [prevOutbound, setPrevOutbound] = useState<DailyOutbound[]>([])
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [drillMode, setDrillMode]       = useState<'color' | 'size'>('color')

  const monthStr    = `${month}`
  const prevMonth   = month === 1 ? 12 : month - 1
  const prevMonthStr = `${prevMonth}`

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    Promise.all([getProducts(), getDailyOutbound(monthStr), getDailyOutbound(prevMonthStr)])
      .then(([p, d, prev]) => { setProducts(p); setOutbound(d); setPrevOutbound(prev) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [monthStr])

  const productMap = useMemo(() => {
    const m: Record<number, Product> = {}
    for (const p of products) m[p.id] = p
    return m
  }, [products])

  // 제품명별 합계
  const barData = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const row of outbound) {
      const name = productMap[row.product_id]?.name
      if (!name) continue
      totals[name] = (totals[name] ?? 0) + row.quantity
    }
    return Object.entries(totals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
  }, [outbound, productMap])

  // 일별 총 출고
  const daysInMonth = dayjs(`${year}-${String(month).padStart(2,'0')}-01`).daysInMonth()
  const lineData = useMemo(() => {
    const daily: Record<string, number> = {}
    for (const row of outbound) daily[row.date] = (daily[row.date] ?? 0) + row.quantity
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1
      const dateStr = `${month}.${String(d).padStart(2,'0')}`
      return { day: `${d}일`, qty: daily[dateStr] ?? 0 }
    })
  }, [outbound, daysInMonth, month])

  // 드릴다운: 선택 제품 색상/사이즈별
  const donutData = useMemo(() => {
    if (!selectedName) return []
    const selectedIds = new Set(products.filter(p => p.name === selectedName).map(p => p.id))
    const totals: Record<string, number> = {}
    for (const row of outbound) {
      if (!selectedIds.has(row.product_id)) continue
      const p = productMap[row.product_id]
      const key = drillMode === 'color' ? p.color : p.size
      totals[key] = (totals[key] ?? 0) + row.quantity
    }
    return Object.entries(totals)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  }, [selectedName, drillMode, outbound, products, productMap])

  const totalOutbound     = barData.reduce((s, d) => s + d.total, 0)
  const prevTotalOutbound = prevOutbound.reduce((s, r) => s + r.quantity, 0)
  const pctChange         = prevTotalOutbound > 0
    ? ((totalOutbound - prevTotalOutbound) / prevTotalOutbound * 100)
    : null
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0)

  // 커스텀 툴팁
  const BarTip = ({ active, payload }: { active?: boolean; payload?: { payload: { name: string; total: number } }[] }) => {
    if (!active || !payload?.length) return null
    const { name, total } = payload[0].payload
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="font-bold text-slate-800 mb-0.5">{name}</p>
        <p className="text-blue-600 font-semibold">{total}개 출고</p>
        <p className="text-slate-400">{totalOutbound > 0 ? ((total / totalOutbound) * 100).toFixed(1) : 0}%</p>
      </div>
    )
  }

  const LineTip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="text-slate-500 mb-0.5">{label}</p>
        <p className="font-bold text-blue-600">{payload[0].value}개</p>
      </div>
    )
  }

  // 도넛 내부 퍼센트 레이블
  const DonutLabel = (props: PieLabelRenderProps) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, value } = props
    if (cx == null || cy == null || midAngle == null || innerRadius == null || outerRadius == null || value == null) return null
    const RADIAN = Math.PI / 180
    const r = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 0.5
    const x = Number(cx) + r * Math.cos(-Number(midAngle) * RADIAN)
    const y = Number(cy) + r * Math.sin(-Number(midAngle) * RADIAN)
    const pct = donutTotal > 0 ? ((Number(value) / donutTotal) * 100).toFixed(0) : '0'
    if (Number(pct) < 8) return null
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight="bold">
        {pct}%
      </text>
    )
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 overflow-auto h-full">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">판매 분석</h1>
          <p className="text-sm text-slate-400 mt-0.5">제품별 출고 현황 및 추이</p>
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
      ) : totalOutbound === 0 ? (
        <div className="flex items-center justify-center h-60 text-slate-300 text-sm">이번 달 출고 데이터가 없습니다</div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
              <p className="text-xs text-slate-400 mb-1">총 출고</p>
              <p className="text-lg font-bold text-blue-600">{totalOutbound}개</p>
              {pctChange !== null && (
                <p className={`text-xs mt-0.5 font-medium ${pctChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  전달 대비 {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(0)}% ({prevTotalOutbound}개)
                </p>
              )}
            </div>
            {[
              { label: '출고 품목수', value: `${barData.length}종`, color: 'text-emerald-600' },
              { label: '1위 제품', value: barData[0]?.name ?? '-', color: 'text-amber-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color} truncate`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

            {/* 가로 막대: 제품명별 */}
            <div className="md:col-span-3 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={16} className="text-blue-500" />
                <h2 className="text-sm font-bold text-slate-700">제품별 출고량</h2>
                <span className="text-xs text-slate-400 ml-auto">클릭하면 세부 분석</span>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(240, barData.length * 32)}>
                <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<BarTip />} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}
                    onClick={(data) => { if (data.name != null) setSelectedName(prev => prev === data.name ? null : data.name as string) }}>
                    {barData.map((entry, i) => (
                      <Cell key={i}
                        fill={selectedName === entry.name ? '#1d4ed8' : '#3b82f6'}
                        opacity={selectedName && selectedName !== entry.name ? 0.4 : 1}
                        cursor="pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 도넛: 드릴다운 */}
            <div className="md:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col">
              {selectedName ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-bold text-slate-700 truncate max-w-[160px]">{selectedName}</h2>
                      <div className="flex gap-1 mt-1">
                        {(['color', 'size'] as const).map(m => (
                          <button key={m} onClick={() => setDrillMode(m)}
                            className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors
                              ${drillMode === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                            {m === 'color' ? '색상별' : '사이즈별'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setSelectedName(null)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>

                  {donutData.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-slate-300 text-xs">출고 데이터 없음</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={donutData} dataKey="value" nameKey="label"
                            cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                            labelLine={false} label={DonutLabel}>
                            {donutData.map((entry, i) => (
                              <Cell key={i}
                                fill={drillMode === 'color' ? getColorHex(entry.label) : CHART_COLORS[i % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => [`${v}개`]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-2 space-y-1.5">
                        {donutData.map((d, i) => (
                          <div key={d.label} className="flex items-center gap-2 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: drillMode === 'color' ? getColorHex(d.label) : CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="text-slate-600 flex-1 truncate">{d.label}</span>
                            <span className="font-semibold text-slate-800">{d.value}개</span>
                            <span className="text-slate-400 w-10 text-right">
                              {donutTotal > 0 ? ((d.value / donutTotal) * 100).toFixed(0) : 0}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2">
                  <BarChart2 size={32} />
                  <p className="text-xs text-center">왼쪽 막대를 클릭하면<br />색상·사이즈별 분석이 표시됩니다</p>
                </div>
              )}
            </div>
          </div>

          {/* 라인: 일별 총 출고 추이 */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-emerald-500" />
              <h2 className="text-sm font-bold text-slate-700">일별 출고 추이</h2>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={lineData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                  interval={Math.floor(daysInMonth / 10)} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<LineTip />} />
                <Line type="monotone" dataKey="qty" stroke="#3b82f6" strokeWidth={2}
                  dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
