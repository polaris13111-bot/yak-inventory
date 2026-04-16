import { useState, useEffect, useMemo } from 'react'
import { ChevronRight, Pencil, Trash2, Check, X, Filter, Package, ShoppingCart, Lock, Download } from 'lucide-react'
import dayjs from 'dayjs'
import { getOrders, updateOrder, deleteOrder, getInventory } from '../api'
import type { Order, InventoryItem } from '../types'
import { useAdmin } from '../context/AdminContext'
import { exportOrders, exportInventory } from '../utils/exportXlsx'

type ViewTab   = 'orders' | 'inventory'
type GroupBy   = 'all' | 'month' | 'week' | 'day'

// M.DD → dayjs 변환 (연도는 현재 연도 기준)
function parseMDD(dateStr: string, year = dayjs().year()): dayjs.Dayjs {
  const [m, dd] = dateStr.split('.')
  if (!m || !dd) return dayjs()
  return dayjs(`${year}-${m.padStart(2, '0')}-${dd.padStart(2, '0')}`)
}

// 주 번호 계산 (연-월-주차)
function weekLabel(dateStr: string): string {
  const d = parseMDD(dateStr)
  const weekOfMonth = Math.ceil(d.date() / 7)
  return `${d.month() + 1}월 ${weekOfMonth}주차`
}

// ─── 관리자 전용 버튼 셀 ─────────────────────────────────
function AdminButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { isAdmin } = useAdmin()
  if (!isAdmin) return <td className="px-4 py-2.5 w-16" />
  return (
    <td className="px-4 py-2.5 w-16">
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="text-slate-400 hover:text-blue-500"><Pencil size={13} /></button>
        <button onClick={onDelete} className="text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
      </div>
    </td>
  )
}

// ─── 발주 인라인 편집 행 ──────────────────────────────────
function OrderRow({
  order, onDelete, onUpdated,
}: {
  order: Order
  onDelete: () => void
  onUpdated: (updated: Order) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState<Partial<Order>>({})

  const startEdit = () => {
    setForm({
      date: order.date, quantity: order.quantity, order_date: order.order_date,
      storage: order.storage, mall: order.mall, orderer: order.orderer,
      recipient: order.recipient, phone: order.phone, address: order.address, memo: order.memo,
    })
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateOrder(order.id, {
        date:       form.date       ?? order.date,
        product_id: order.product_id,
        quantity:   form.quantity   ?? order.quantity,
        order_date: form.order_date ?? order.order_date,
        storage:    form.storage    ?? order.storage,
        mall:       form.mall       ?? order.mall,
        orderer:    form.orderer    ?? order.orderer,
        recipient:  form.recipient  ?? order.recipient,
        phone:      form.phone      ?? order.phone,
        address:    form.address    ?? order.address,
        memo:       form.memo       ?? order.memo,
      })
      onUpdated(updated)
      setEditing(false)
    } catch {
      // 실패해도 편집 상태 유지
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <tr className="bg-blue-50/50">
        <td className="px-4 py-2">
          <input value={form.date ?? ''} onChange={e => setForm(p => ({...p, date: e.target.value}))}
            className="w-16 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </td>
        <td className="px-4 py-2" colSpan={2}>
          <p className="text-xs text-slate-600">
            {order.product?.name} / {order.product?.color} / {order.product?.size}
          </p>
        </td>
        <td className="px-4 py-2">
          <input type="number" value={form.quantity ?? ''} onChange={e => setForm(p => ({...p, quantity: Number(e.target.value)}))}
            className="w-14 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </td>
        <td className="px-4 py-2">
          <input value={form.recipient ?? ''} onChange={e => setForm(p => ({...p, recipient: e.target.value}))}
            className="w-20 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </td>
        <td className="px-4 py-2">
          <input value={form.mall ?? ''} onChange={e => setForm(p => ({...p, mall: e.target.value}))}
            className="w-20 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </td>
        <td className="px-4 py-2">
          <input value={form.memo ?? ''} onChange={e => setForm(p => ({...p, memo: e.target.value}))}
            className="w-28 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1.5">
            <button onClick={handleSave} disabled={saving}
              className="text-green-500 hover:text-green-700 disabled:opacity-40">
              <Check size={14} />
            </button>
            <button onClick={() => setEditing(false)} disabled={saving}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-40">
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-slate-50/50 transition-colors group">
      <td className="px-4 py-2.5 text-sm text-slate-700 font-mono">{order.date}</td>
      <td className="px-4 py-2.5 text-sm font-medium text-slate-700">
        {order.product?.name}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">
        {order.product?.color} / {order.product?.size}
      </td>
      <td className="px-4 py-2.5 text-sm font-bold text-blue-700">{order.quantity}</td>
      <td className="px-4 py-2.5 text-sm text-slate-600">{order.recipient}</td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{order.mall}</td>
      <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[120px] truncate">{order.memo}</td>
      <AdminButtons onEdit={startEdit} onDelete={onDelete} />
    </tr>
  )
}

// ─── 메인 ─────────────────────────────────────────────────
export default function History() {
  const { isAdmin }           = useAdmin()
  const [tab, setTab]         = useState<ViewTab>('orders')
  const [groupBy, setGroupBy] = useState<GroupBy>('month')
  const [orders, setOrders]   = useState<Order[]>([])
  const [inventory, setInv]   = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      getOrders(),
      getInventory(),
    ]).then(([o, inv]) => {
      setOrders([...o].reverse())   // 최신 순
      setInv([...inv].reverse())
    }).finally(() => setLoading(false))
  }
  useEffect(() => { loadAll() }, [])

  const handleDeleteOrder = async (id: number) => {
    if (!confirm('이 발주 내역을 삭제할까요?')) return
    await deleteOrder(id)
    setOrders(prev => prev.filter(o => o.id !== id))
  }

  // 검색 필터
  const filteredOrders = useMemo(() => {
    if (!search) return orders
    const q = search.toLowerCase()
    return orders.filter(o => {
      const text = [o.date, o.product?.name, o.product?.color, o.product?.size,
                    o.recipient, o.mall, o.orderer, o.memo].join(' ').toLowerCase()
      return text.includes(q)
    })
  }, [orders, search])

  const filteredInv = useMemo(() => {
    if (!search) return inventory
    const q = search.toLowerCase()
    return inventory.filter(i => {
      const text = [i.date, i.product?.name, i.product?.color, i.product?.size, i.notes].join(' ').toLowerCase()
      return text.includes(q)
    })
  }, [inventory, search])

  // 그룹핑
  const getGroupKey = (dateStr: string): string => {
    if (groupBy === 'all')   return '전체'
    if (groupBy === 'month') return `${dateStr.split('.')[0]}월`
    if (groupBy === 'week')  return weekLabel(dateStr)
    if (groupBy === 'day')   return dateStr
    return dateStr
  }

  const groupedOrders = useMemo(() => {
    const groups: Record<string, Order[]> = {}
    for (const o of filteredOrders) {
      const key = getGroupKey(o.date)
      if (!groups[key]) groups[key] = []
      groups[key].push(o)
    }
    return groups
  }, [filteredOrders, groupBy])

  const groupedInv = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {}
    for (const i of filteredInv) {
      const key = getGroupKey(i.date)
      if (!groups[key]) groups[key] = []
      groups[key].push(i)
    }
    return groups
  }, [filteredInv, groupBy])

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })

  // groupBy 또는 tab 변경 시 첫 그룹 열기
  useEffect(() => {
    const keys = tab === 'orders'
      ? Object.keys(groupedOrders)
      : Object.keys(groupedInv)
    if (keys.length > 0) setOpenGroups(new Set([keys[0]]))
  }, [groupBy, tab])

  const totalOrders = filteredOrders.length
  const totalQty    = filteredOrders.reduce((s, o) => s + o.quantity, 0)
  const totalInQty  = filteredInv.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="p-6 max-w-6xl space-y-5">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">내역 관리</h1>
        <p className="text-sm text-slate-400 mt-1">발주 · 입고 전체 누적 내역 조회 및 수정</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button onClick={() => setTab('orders')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors
            ${tab === 'orders' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <ShoppingCart size={15} />발주 내역
        </button>
        <button onClick={() => setTab('inventory')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors
            ${tab === 'inventory' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Package size={15} />입고 내역
        </button>
      </div>

      {/* 상단 통계 + 필터 컨트롤 */}
      {/* 읽기 전용 안내 배너 */}
      {!isAdmin && (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500">
          <Lock size={12} />읽기 전용 모드 · 수정/삭제는 관리자 모드에서 가능합니다
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-4">
          {tab === 'orders' ? (
            <>
              <div className="bg-white rounded-lg px-4 py-2.5 border border-slate-100 shadow-sm text-center">
                <p className="text-xs text-slate-400">총 건수</p>
                <p className="text-xl font-bold text-slate-800">{totalOrders}</p>
              </div>
              <div className="bg-white rounded-lg px-4 py-2.5 border border-slate-100 shadow-sm text-center">
                <p className="text-xs text-slate-400">총 출고량</p>
                <p className="text-xl font-bold text-blue-700">{totalQty}개</p>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-lg px-4 py-2.5 border border-slate-100 shadow-sm text-center">
              <p className="text-xs text-slate-400">총 입고량</p>
              <p className="text-xl font-bold text-green-700">{totalInQty}개</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* 그룹핑 */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            {([['all','전체'], ['month','월별'], ['week','주별'], ['day','일별']] as [GroupBy, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setGroupBy(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors
                  ${groupBy === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
          {/* 검색 */}
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="검색..."
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          {/* 다운로드 */}
          <button
            onClick={() => tab === 'orders'
              ? exportOrders(filteredOrders, search ? `발주_검색결과` : '발주내역')
              : exportInventory(filteredInv, search ? `입고_검색결과` : '입고내역')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <Download size={13} />엑셀
          </button>
        </div>
      </div>

      {/* 내역 테이블 */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">로딩 중...</div>
      ) : tab === 'orders' ? (
        <div className="space-y-3">
          {Object.entries(groupedOrders).map(([groupKey, rows]) => {
            const isOpen = openGroups.has(groupKey)
            const groupQty = rows.reduce((s, r) => s + r.quantity, 0)
            return (
              <div key={groupKey} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleGroup(groupKey)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <ChevronRight size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    <span className="font-semibold text-slate-700">{groupKey}</span>
                    <span className="text-xs text-slate-400">{rows.length}건</span>
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{groupQty}개 출고</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 overflow-auto">
                    <table className="w-full text-sm" style={{ minWidth: '700px' }}>
                      <thead>
                        <tr className="bg-slate-50/80 text-xs">
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-16">발주일</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">제품명</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">색상/사이즈</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-12">수량</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">수령인</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">MALL</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">메모</th>
                          <th className="px-4 py-2 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map(order => (
                          <OrderRow
                            key={order.id}
                            order={order}
                            onDelete={() => handleDeleteOrder(order.id)}
                            onUpdated={updated => setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
          {Object.keys(groupedOrders).length === 0 && (
            <div className="text-center py-16 text-slate-400 text-sm">발주 내역 없음</div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedInv).map(([groupKey, rows]) => {
            const isOpen = openGroups.has(groupKey)
            const groupQty = rows.reduce((s, r) => s + r.quantity, 0)
            return (
              <div key={groupKey} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleGroup(groupKey)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <ChevronRight size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    <span className="font-semibold text-slate-700">{groupKey}</span>
                    <span className="text-xs text-slate-400">{rows.length}건</span>
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">+{groupQty}개 입고</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 overflow-auto">
                    <table className="w-full text-sm" style={{ minWidth: '600px' }}>
                      <thead>
                        <tr className="bg-slate-50/80 text-xs">
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-16">날짜</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">제품명</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">색상/사이즈</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-12">수량</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-16">유형</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">메모</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5 text-sm font-mono text-slate-700">{item.date}</td>
                            <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{item.product?.name}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">
                              {item.product?.color} / {item.product?.size}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-bold text-green-700">+{item.quantity}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs px-2 py-0.5 rounded font-medium
                                ${item.type === 'normal' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {item.type === 'normal' ? '정상' : '반품'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-400">{item.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
          {Object.keys(groupedInv).length === 0 && (
            <div className="text-center py-16 text-slate-400 text-sm">입고 내역 없음</div>
          )}
        </div>
      )}
    </div>
  )
}
