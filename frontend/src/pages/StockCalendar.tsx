import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Search, X, Package, Download } from 'lucide-react'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { getProducts, getDailyOutbound, getOrders } from '../api'
import type { Product, DailyOutbound, Order } from '../types'
import { getColorHex } from '../utils/colors'

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

/** 수량에 따른 셀 스타일 (히트맵) */
function cellStyle(val: number, isSelected: boolean, isToday = false): string {
  if (isSelected && val > 0) return 'bg-blue-200 text-blue-900 font-bold'
  if (isSelected)            return 'bg-blue-50'
  if (val === 0)             return isToday ? 'bg-blue-50/40 text-slate-200' : 'text-slate-200'
  if (val >= 10)             return 'bg-blue-300 text-blue-950 font-bold'
  if (val >= 5)              return 'bg-blue-200 text-blue-800 font-bold'
  if (val >= 3)              return 'bg-blue-100 text-blue-700 font-semibold'
  if (val >= 2)              return 'bg-blue-50 text-blue-700 font-semibold'
  return                            'bg-blue-50/60 text-blue-600 font-medium'
}

export default function StockCalendar() {
  const [month, setMonth]   = useState(dayjs().month() + 1)
  const [year]              = useState(dayjs().year())
  const [includeKws, setInc] = useState<string[]>([])
  const [excludeKws, setExc] = useState<string[]>([])
  const [inputInc, setInputInc] = useState('')
  const [inputExc, setInputExc] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const [products, setProducts]   = useState<Product[]>([])
  const [outbound, setOutbound]   = useState<DailyOutbound[]>([])
  const [dayOrders, setDayOrders] = useState<Order[]>([])
  const [loading, setLoading]     = useState(true)

  const monthStr = `${year}-${String(month).padStart(2,'0')}`
  const todayStr = dayjs().format('YYYY-MM-DD')

  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    Promise.all([getProducts(), getDailyOutbound(monthStr)])
      .then(([prods, daily]) => { setProducts(prods); setOutbound(daily) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [monthStr])

  useEffect(() => {
    if (!selectedDate) { setDayOrders([]); return }
    getOrders({ date: selectedDate }).then(setDayOrders)
  }, [selectedDate])

  const daysInMonth = dayjs(`${year}-${String(month).padStart(2,'0')}-01`).daysInMonth()
  const firstDow    = dayjs(`${year}-${String(month).padStart(2,'0')}-01`).day()

  const dates = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const dow = dayjs(dateStr).day()
    return { dateStr, day: d, dow }
  }), [month, year, daysInMonth])

  const outboundMap = useMemo(() => {
    const m: Record<string, Record<number, number>> = {}
    for (const row of outbound) {
      if (!m[row.date]) m[row.date] = {}
      m[row.date][row.product_id] = row.quantity
    }
    return m
  }, [outbound])

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const text = `${p.name} ${p.color} ${p.size}`
        const passInc = includeKws.length === 0 || includeKws.every(kw => text.includes(kw))
        const passExc = excludeKws.length === 0 || excludeKws.every(kw => !text.includes(kw))
        return passInc && passExc
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [products, includeKws, excludeKws])

  // 월 전체 합계
  const monthTotal = useMemo(() =>
    filteredProducts.reduce((sum, p) =>
      sum + dates.reduce((s, { dateStr }) => s + (outboundMap[dateStr]?.[p.id] ?? 0), 0)
    , 0)
  , [filteredProducts, dates, outboundMap])

  // 날짜별 합계 (총계 행용)
  const dateTotals = useMemo(() =>
    dates.map(({ dateStr }) =>
      filteredProducts.reduce((s, p) => s + (outboundMap[dateStr]?.[p.id] ?? 0), 0)
    )
  , [dates, filteredProducts, outboundMap])

  const downloadExcel = () => {
    const headers = ['제품명', '색상', '사이즈', ...dates.map(d => `${d.day}일`), '합계']
    const dataRows = filteredProducts.map(p => {
      const rowTotal = dates.reduce((s, { dateStr }) => s + (outboundMap[dateStr]?.[p.id] ?? 0), 0)
      return [
        p.name, p.color, p.size,
        ...dates.map(({ dateStr }) => outboundMap[dateStr]?.[p.id] ?? 0),
        rowTotal,
      ]
    })
    const totalRow = ['일별 합계', '', '', ...dateTotals, monthTotal]

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, totalRow])
    ws['!cols'] = [
      { wch: 24 }, { wch: 10 }, { wch: 8 },
      ...dates.map(() => ({ wch: 5 })),
      { wch: 6 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${year}년 ${month}월`)
    XLSX.writeFile(wb, `출고현황_${year}년${String(month).padStart(2,'0')}월.xlsx`)
  }

  const addKw = (type: 'inc' | 'exc') => {
    const val = (type === 'inc' ? inputInc : inputExc).trim()
    if (!val) return
    if (type === 'inc') { setInc(p => p.includes(val) ? p : [...p, val]); setInputInc('') }
    else                { setExc(p => p.includes(val) ? p : [...p, val]); setInputExc('') }
  }

  // 모바일 날짜 detail panel
  const MobileDayPanel = () => {
    if (!selectedDate) return null
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-800 text-sm">{selectedDate}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {DAY_KO[dayjs(`${year}-${String(month).padStart(2,'0')}-${selectedDate.split('-')[2]}`).day()]}요일
              · {dayOrders.length}건 발주
            </p>
          </div>
          <button onClick={() => setSelectedDate(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="p-3 space-y-2 max-h-72 overflow-auto">
          {dayOrders.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-300">
              <Package size={28} className="mb-2" />
              <p className="text-sm">발주 내역 없음</p>
            </div>
          ) : (
            dayOrders.map(o => (
              <div key={o.id}
                className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-blue-200 transition-colors">
                {o.product && (
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ring-1 ring-black/10"
                      style={{ background: getColorHex(o.product.color) }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 leading-tight truncate">{o.product.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {o.product.color}
                        <span className="ml-1 px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-400">
                          {o.product.size}
                        </span>
                      </p>
                    </div>
                    <span className="text-sm font-bold text-blue-600 shrink-0">{o.quantity}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-slate-50 pt-1.5">
                  {o.mall      && <p className="text-[10px] text-slate-400"><span className="text-slate-300">Mall</span> {o.mall}</p>}
                  {o.recipient && <p className="text-[10px] text-slate-400"><span className="text-slate-300">수령인</span> {o.recipient}</p>}
                </div>
              </div>
            ))
          )}
        </div>
        {dayOrders.length > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-100 text-right">
            <span className="text-xs font-bold text-blue-600">
              총 {dayOrders.reduce((s, o) => s + o.quantity, 0)}개 출고
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">

        {loadError && (
          <div className="mx-3 md:mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            데이터 로드에 실패했습니다. 페이지를 새로고침 해주세요.
          </div>
        )}

        {/* ── 헤더 ── */}
        <div className="px-3 md:px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={() => setMonth(m => Math.max(1, m - 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronLeft size={17} />
            </button>
            <h1 className="text-sm md:text-base font-bold text-slate-800 whitespace-nowrap">
              {year}년 {month}월 출고 현황
            </h1>
            <button onClick={() => setMonth(m => Math.min(12, m + 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-4 text-xs text-slate-500">
            <span className="hidden sm:flex items-center gap-1">
              <Package size={13} className="text-slate-400" />
              <span className="font-medium text-slate-700">{filteredProducts.length}</span>개 품목
            </span>
            <span className="flex items-center gap-1">
              <span className="hidden sm:inline">이번 달 총 출고</span>
              <span className="font-bold text-blue-600 text-sm">{monthTotal}</span>
              <span className="sm:hidden text-[10px] text-slate-400">건</span>
              <span className="hidden sm:inline">건</span>
            </span>
            <button onClick={downloadExcel}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs font-medium">
              <Download size={13} />엑셀 다운로드
            </button>
          </div>
        </div>

        {/* ── 필터 바 (데스크탑 전용) ── */}
        <div className="hidden md:flex px-6 py-2.5 bg-slate-50 border-b border-slate-200 gap-6 items-center">
          <div className="flex items-center gap-2 flex-1">
            <Search size={13} className="text-green-600 shrink-0" />
            <span className="text-xs font-medium text-green-700 shrink-0">포함</span>
            <div className="flex flex-wrap gap-1">
              {includeKws.map(kw => (
                <span key={kw} className="flex items-center gap-0.5 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                  {kw}
                  <button onClick={() => setInc(p => p.filter(k => k !== kw))} className="ml-0.5 hover:text-green-900">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <input value={inputInc} onChange={e => setInputInc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKw('inc')}
              placeholder="Enter로 추가"
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-green-400" />
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="flex items-center gap-2 flex-1">
            <X size={13} className="text-red-500 shrink-0" />
            <span className="text-xs font-medium text-red-600 shrink-0">제외</span>
            <div className="flex flex-wrap gap-1">
              {excludeKws.map(kw => (
                <span key={kw} className="flex items-center gap-0.5 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs">
                  {kw}
                  <button onClick={() => setExc(p => p.filter(k => k !== kw))} className="ml-0.5 hover:text-red-900">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <input value={inputExc} onChange={e => setInputExc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKw('exc')}
              placeholder="Enter로 추가"
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-red-300" />
          </div>
        </div>

        {/* ── 모바일 캘린더 뷰 ── */}
        <div className="flex-1 overflow-auto md:hidden p-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">로딩 중...</div>
          ) : (
            <>
              {/* 캘린더 그리드 */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                {/* 요일 헤더 */}
                <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
                  {DAY_KO.map((d, i) => (
                    <div key={d} className={`text-center py-2 text-[11px] font-semibold
                      ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'}`}>
                      {d}
                    </div>
                  ))}
                </div>
                {/* 날짜 셀 */}
                <div className="grid grid-cols-7">
                  {/* 첫 날 앞 빈 칸 */}
                  {Array.from({ length: firstDow }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[3.2rem] border-r border-b border-slate-50" />
                  ))}
                  {dates.map(({ dateStr, day, dow }, idx) => {
                    const total   = dateTotals[idx] ?? 0
                    const isToday = dateStr === todayStr
                    const isSel   = dateStr === selectedDate
                    return (
                      <div key={dateStr}
                        onClick={() => setSelectedDate(d => d === dateStr ? null : dateStr)}
                        className={`min-h-[3.2rem] p-1 text-center cursor-pointer transition-colors
                          border-r border-b border-slate-50 select-none
                          ${isSel ? 'bg-blue-500' : isToday ? 'bg-blue-50' : 'active:bg-slate-50'}`}>
                        <div className={`text-[12px] font-bold leading-tight mt-0.5
                          ${isSel ? 'text-white'
                          : isToday ? 'text-blue-600'
                          : dow === 0 ? 'text-red-400'
                          : dow === 6 ? 'text-blue-400'
                          : 'text-slate-700'}`}>
                          {day}
                        </div>
                        {total > 0 && (
                          <div className={`text-[10px] font-bold mt-0.5 rounded-sm
                            ${isSel ? 'text-blue-100' : 'text-blue-600'}`}>
                            {total}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 선택 날짜 상세 */}
              <MobileDayPanel />
            </>
          )}
        </div>

        {/* ── 데스크탑 캘린더 테이블 ── */}
        <div className="flex-1 overflow-auto hidden md:block">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">로딩 중...</div>
          ) : (
            <table className="border-collapse text-xs" style={{ minWidth: `${dates.length * 44 + 200}px`, width: '100%' }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  {/* 제품 헤더 */}
                  <th className="sticky left-0 z-20 bg-slate-100 px-4 py-2.5 text-left font-semibold text-slate-500
                                 border-b-2 border-r border-slate-200 w-52 text-[11px] tracking-wide uppercase">
                    제품
                  </th>
                  {/* 날짜 헤더 */}
                  {dates.map(({ dateStr, day, dow }) => {
                    const isSat   = dow === 6
                    const isSun   = dow === 0
                    const isToday = dateStr === todayStr
                    const isSel   = dateStr === selectedDate
                    return (
                      <th key={dateStr}
                        onClick={() => setSelectedDate(d => d === dateStr ? null : dateStr)}
                        className={`w-11 border-b-2 border-r text-center cursor-pointer transition-colors select-none
                          ${isSel   ? 'bg-blue-500 text-white border-blue-600'
                          : isToday ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : isSat   ? 'bg-blue-50/60 text-blue-500 border-slate-200'
                          : isSun   ? 'bg-red-50/60 text-red-400 border-slate-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-200'}`}>
                        <div className="py-1">
                          <div className="font-bold text-[12px] leading-tight">{String(day).padStart(2,'0')}</div>
                          <div className={`text-[9px] leading-tight font-medium
                            ${isSel ? 'text-blue-100' : isSat ? 'text-blue-400' : isSun ? 'text-red-300' : 'text-slate-400'}`}>
                            {DAY_KO[dow]}
                          </div>
                        </div>
                      </th>
                    )
                  })}
                  {/* 합계 헤더 */}
                  <th className="sticky right-0 z-20 bg-slate-100 px-3 py-2.5 font-semibold text-slate-500
                                 border-b-2 border-l-2 border-slate-200 text-center w-14 text-[11px] uppercase tracking-wide">
                    합계
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((p, i, arr) => {
                  const rowTotal    = dates.reduce((s, { dateStr }) => s + (outboundMap[dateStr]?.[p.id] ?? 0), 0)
                  const isGroupStart = i === 0 || arr[i - 1].name !== p.name
                  const isGroupEnd   = i === arr.length - 1 || arr[i + 1].name !== p.name

                  return (
                    <tr key={p.id}
                      className={`group hover:bg-blue-50/30 transition-colors
                        ${isGroupStart && i !== 0 ? 'border-t-2 border-slate-200' : ''}
                        ${isGroupEnd ? 'border-b border-slate-100' : ''}`}>

                      {/* 제품 셀 */}
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/30
                                     border-r border-slate-100 transition-colors"
                        style={{ borderLeft: `3px solid ${getColorHex(p.color)}` }}>
                        <div className="px-3 py-1.5">
                          {isGroupStart && (
                            <p className="text-[11px] font-bold text-slate-700 leading-tight mb-1 truncate">
                              {p.name}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 pl-1">
                            <span className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-black/10"
                              style={{ background: getColorHex(p.color) }} />
                            <span className="text-[11px] text-slate-500">{p.color}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded font-mono">
                              {p.size}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 날짜별 수량 셀 */}
                      {dates.map(({ dateStr, dow }) => {
                        const val     = outboundMap[dateStr]?.[p.id] ?? 0
                        const isSel   = dateStr === selectedDate
                        const isSat   = dow === 6
                        const isSun   = dow === 0
                        const isToday = dateStr === todayStr
                        return (
                          <td key={dateStr}
                            onClick={() => setSelectedDate(d => d === dateStr ? null : dateStr)}
                            className={`border-r border-b border-slate-100 text-center cursor-pointer
                                        transition-colors py-1.5
                              ${cellStyle(val, isSel, isToday)}
                              ${!isSel && val === 0 && (isSat || isSun) ? 'bg-slate-50/60' : ''}`}>
                            {val > 0 ? val : <span className="text-slate-200 text-[10px]">·</span>}
                          </td>
                        )
                      })}

                      {/* 행 합계 */}
                      <td className={`sticky right-0 z-10 bg-white group-hover:bg-blue-50/30
                                      border-l-2 border-slate-200 text-center font-bold transition-colors
                                      ${rowTotal > 0 ? 'text-slate-700' : 'text-slate-200'}`}>
                        {rowTotal > 0 ? rowTotal : ''}
                      </td>
                    </tr>
                  )
                })}

                {/* 날짜별 총계 행 */}
                {filteredProducts.length > 0 && (
                  <tr className="border-t-2 border-slate-300 bg-slate-50 sticky bottom-0 z-10">
                    <td className="sticky left-0 z-20 bg-slate-50 px-4 py-2 border-r border-slate-200"
                      style={{ borderLeft: '3px solid #94a3b8' }}>
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                        일별 합계
                      </span>
                    </td>
                    {dateTotals.map((total, idx) => {
                      const isToday = dates[idx].dateStr === todayStr
                      return (
                        <td key={idx}
                          className={`border-r border-slate-200 text-center py-2 text-[11px]
                            ${isToday ? 'bg-blue-50/60' : ''}
                            ${total > 0 ? 'font-bold text-slate-700' : 'text-slate-300'}`}>
                          {total > 0 ? total : ''}
                        </td>
                      )
                    })}
                    <td className="sticky right-0 z-20 bg-slate-50 border-l-2 border-slate-200
                                   text-center font-bold text-blue-700 text-sm py-2">
                      {monthTotal}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── 날짜 슬라이드 패널 (데스크탑 전용) ── */}
      {selectedDate && (
        <div className="hidden md:flex w-72 bg-white border-l border-slate-200 flex-col shadow-lg shrink-0">
          {/* 패널 헤더 */}
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-800 text-sm">{selectedDate}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {DAY_KO[dayjs(`${year}-${String(month).padStart(2,'0')}-${selectedDate.split('-')[2]}`).day()]}요일
                · {dayOrders.length}건 발주
              </p>
            </div>
            <button onClick={() => setSelectedDate(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* 발주 목록 */}
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {dayOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                <Package size={32} className="mb-2" />
                <p className="text-sm">발주 내역 없음</p>
              </div>
            ) : (
              dayOrders.map(o => (
                <div key={o.id}
                  className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-blue-200 transition-colors">
                  {o.product && (
                    <div className="flex items-start gap-2 mb-2">
                      <span className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ring-1 ring-black/10"
                        style={{ background: getColorHex(o.product.color) }} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 leading-tight truncate">
                          {o.product.name}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {o.product.color}
                          <span className="ml-1 px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-400">
                            {o.product.size}
                          </span>
                        </p>
                      </div>
                      <span className="ml-auto text-sm font-bold text-blue-600 shrink-0">
                        {o.quantity}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-slate-50 pt-2">
                    {o.mall     && <p className="text-[10px] text-slate-400"><span className="text-slate-300">Mall</span> {o.mall}</p>}
                    {o.recipient && <p className="text-[10px] text-slate-400"><span className="text-slate-300">수령인</span> {o.recipient}</p>}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 패널 푸터 */}
          {dayOrders.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">{dayOrders.length}건</span>
              <span className="text-xs font-bold text-blue-600">
                총 {dayOrders.reduce((s, o) => s + o.quantity, 0)}개 출고
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
