import { useState, useEffect, useMemo } from 'react'
import { ChevronRight, Pencil, Trash2, Check, X, Filter, Package, ShoppingCart, Lock, Download } from 'lucide-react'
import dayjs from 'dayjs'
import { getOrders, updateOrder, deleteOrder, batchDeleteOrders, getInventory, updateInventory, deleteInventory, batchDeleteInventory } from '../api'
import type { Order, InventoryItem } from '../types'
import { useAdmin } from '../context/AdminContext'
import { exportOrders, exportInventory } from '../utils/exportXlsx'

type ViewTab   = 'orders' | 'inventory'
type GroupBy   = 'all' | 'month' | 'week' | 'day'

function parseMDD(dateStr: string, year = dayjs().year()): dayjs.Dayjs {
  const [m, dd] = dateStr.split('.')
  if (!m || !dd) return dayjs()
  return dayjs(`${year}-${m.padStart(2, '0')}-${dd.padStart(2, '0')}`)
}

function weekLabel(dateStr: string): string {
  const d = parseMDD(dateStr)
  const weekOfMonth = Math.ceil(d.date() / 7)
  return `${d.month() + 1}월 ${weekOfMonth}주차`
}

// ─── 발주 인라인 편집 행 ──────────────────────────────────
function OrderRow({
  order, selected, onToggle, onDelete, onUpdated, isAdmin,
}: {
  order: Order
  selected: boolean
  onToggle: () => void
  onDelete: () => void
  onUpdated: (updated: Order) => void
  isAdmin: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [saveError, setSaveError] = useState(false)
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
    setSaveError(false)
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
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <tr className="bg-blue-50/50">
        <td className="px-3 py-2">
          <input type="checkbox" checked={selected} onChange={onToggle}
            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400" />
        </td>
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
          <div className="flex flex-col gap-1">
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
            {saveError && <p className="text-[10px] text-red-500">저장 실패</p>}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={`hover:bg-slate-50/50 transition-colors group ${selected ? 'bg-blue-50/40' : ''}`}>
      <td className="px-3 py-2.5">
        <input type="checkbox" checked={selected} onChange={onToggle}
          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer" />
      </td>
      <td className="px-4 py-2.5 text-sm text-slate-700 font-mono">{order.date}</td>
      <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{order.product?.name}</td>
      <td className="px-4 py-2.5 text-xs text-slate-500">
        {order.product?.color} / {order.product?.size}
      </td>
      <td className="px-4 py-2.5 text-sm font-bold text-blue-700">{order.quantity}</td>
      <td className="px-4 py-2.5 text-sm text-slate-600">{order.recipient}</td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{order.mall}</td>
      <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[120px] truncate">{order.memo}</td>
      {isAdmin && (
        <td className="px-4 py-2.5 w-16">
          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={startEdit} className="text-slate-400 hover:text-blue-500"><Pencil size={13} /></button>
            <button onClick={onDelete} className="text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
          </div>
        </td>
      )}
    </tr>
  )
}

// ─── 입고 인라인 편집 행 ──────────────────────────────────
function InventoryRow({
  item, selected, onToggle, onDelete, onUpdated, isAdmin,
}: {
  item: InventoryItem
  selected: boolean
  onToggle: () => void
  onDelete: () => void
  onUpdated: (updated: InventoryItem) => void
  isAdmin: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [form, setForm] = useState<Partial<InventoryItem>>({})

  const startEdit = () => {
    setForm({ date: item.date, quantity: item.quantity, type: item.type, notes: item.notes })
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true); setSaveError(false)
    try {
      const updated = await updateInventory(item.id, {
        date:       form.date       ?? item.date,
        product_id: item.product_id,
        quantity:   form.quantity   ?? item.quantity,
        type:       form.type       ?? item.type,
        notes:      form.notes      ?? item.notes,
      })
      onUpdated(updated); setEditing(false)
    } catch { setSaveError(true) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <tr className="bg-green-50/50">
        <td className="px-3 py-2">
          <input type="checkbox" checked={selected} onChange={onToggle}
            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400" />
        </td>
        <td className="px-4 py-2">
          <input value={form.date ?? ''} onChange={e => setForm(p => ({...p, date: e.target.value}))}
            className="w-16 border border-green-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
        </td>
        <td className="px-4 py-2 text-xs text-slate-600" colSpan={2}>
          {item.product?.name} / {item.product?.color} / {item.product?.size}
        </td>
        <td className="px-4 py-2">
          <input type="number" value={form.quantity ?? ''} onChange={e => setForm(p => ({...p, quantity: Number(e.target.value)}))}
            className="w-14 border border-green-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
        </td>
        <td className="px-4 py-2">
          <select value={form.type ?? 'normal'} onChange={e => setForm(p => ({...p, type: e.target.value as 'normal' | 'return'}))}
            className="border border-green-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400">
            <option value="normal">정상</option>
            <option value="return">반품</option>
          </select>
        </td>
        <td className="px-4 py-2">
          <input value={form.notes ?? ''} onChange={e => setForm(p => ({...p, notes: e.target.value}))}
            className="w-32 border border-green-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
        </td>
        <td className="px-4 py-2">
          <div className="flex flex-col gap-1">
            <div className="flex gap-1.5">
              <button onClick={handleSave} disabled={saving} className="text-green-500 hover:text-green-700 disabled:opacity-40"><Check size={14} /></button>
              <button onClick={() => setEditing(false)} disabled={saving} className="text-slate-400 hover:text-slate-600 disabled:opacity-40"><X size={14} /></button>
            </div>
            {saveError && <p className="text-[10px] text-red-500">저장 실패</p>}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={`hover:bg-slate-50/50 transition-colors group ${selected ? 'bg-green-50/40' : ''}`}>
      <td className="px-3 py-2.5">
        <input type="checkbox" checked={selected} onChange={onToggle}
          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer" />
      </td>
      <td className="px-4 py-2.5 text-sm font-mono text-slate-700">{item.date}</td>
      <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{item.product?.name}</td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{item.product?.color} / {item.product?.size}</td>
      <td className="px-4 py-2.5 text-sm font-bold text-green-700">+{item.quantity}</td>
      <td className="px-4 py-2.5">
        <span className={`text-xs px-2 py-0.5 rounded font-medium
          ${item.type === 'normal' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {item.type === 'normal' ? '정상' : '반품'}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-400">{item.notes}</td>
      {isAdmin && (
        <td className="px-4 py-2.5 w-16">
          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={startEdit} className="text-slate-400 hover:text-blue-500"><Pencil size={13} /></button>
            <button onClick={onDelete} className="text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
          </div>
        </td>
      )}
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
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const [loadError, setLoadError] = useState(false)

  const loadAll = () => {
    setLoading(true)
    setLoadError(false)
    Promise.all([getOrders(), getInventory()])
      .then(([o, inv]) => {
        setOrders([...o].reverse())
        setInv([...inv].reverse())
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadAll() }, [])

  const handleDeleteOrder = async (id: number) => {
    if (!confirm('이 발주 내역을 삭제할까요?')) return
    await deleteOrder(id)
    setOrders(prev => prev.filter(o => o.id !== id))
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const handleDeleteInvItem = async (id: number) => {
    if (!confirm('이 입고 내역을 삭제할까요?')) return
    await deleteInventory(id)
    setInv(prev => prev.filter(i => i.id !== id))
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`선택한 ${selected.size}건을 삭제할까요?`)) return
    setBulkDeleting(true)
    try {
      if (tab === 'orders') {
        await batchDeleteOrders(Array.from(selected))
        setOrders(prev => prev.filter(o => !selected.has(o.id)))
      } else {
        await batchDeleteInventory(Array.from(selected))
        setInv(prev => prev.filter(i => !selected.has(i.id)))
      }
      setSelected(new Set())
    } finally {
      setBulkDeleting(false)
    }
  }

  const toggleSelect = (id: number) =>
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

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

  const toggleInvGroupSelect = (rows: InventoryItem[]) => {
    const ids = rows.map(r => r.id)
    const allSelected = ids.every(id => selected.has(id))
    setSelected(prev => {
      const n = new Set(prev)
      if (allSelected) ids.forEach(id => n.delete(id))
      else ids.forEach(id => n.add(id))
      return n
    })
  }

  // 그룹 내 전체선택
  const toggleGroupSelect = (rows: Order[]) => {
    const ids = rows.map(r => r.id)
    const allSelected = ids.every(id => selected.has(id))
    setSelected(prev => {
      const n = new Set(prev)
      if (allSelected) ids.forEach(id => n.delete(id))
      else ids.forEach(id => n.add(id))
      return n
    })
  }

  // 탭 전환 시 선택 초기화
  useEffect(() => { setSelected(new Set()) }, [tab])

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
    <div className="p-3 md:p-6 max-w-6xl space-y-4 md:space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">내역 관리</h1>
        <p className="text-sm text-slate-400 mt-1">발주 · 입고 전체 누적 내역 조회 및 수정</p>
      </div>

      {loadError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          데이터 로드에 실패했습니다. 페이지를 새로고침 해주세요.
        </div>
      )}

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

      {!isAdmin && (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500">
          <Lock size={12} />읽기 전용 모드 · 수정/삭제는 관리자 모드에서 가능합니다
        </div>
      )}

      {/* 일괄 삭제 바 */}
      {isAdmin && selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-sm font-medium text-red-700">{selected.size}건 선택됨</span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium
                       hover:bg-red-700 disabled:opacity-50 transition-colors">
            <Trash2 size={12} />{bulkDeleting ? '삭제 중...' : '선택 삭제'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-red-500 hover:text-red-700">
            취소
          </button>
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
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            {([['all','전체'], ['month','월별'], ['week','주별'], ['day','일별']] as [GroupBy, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setGroupBy(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors
                  ${groupBy === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="검색..."
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <button
            onClick={() => tab === 'orders'
              ? exportOrders(filteredOrders, search ? `발주_검색결과` : '발주내역')
              : exportInventory(filteredInv, search ? `입고_검색결과` : '입고내역')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <Download size={13} />엑셀
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">로딩 중...</div>
      ) : tab === 'orders' ? (
        <div className="space-y-3">
          {Object.entries(groupedOrders).map(([groupKey, rows]) => {
            const isOpen = openGroups.has(groupKey)
            const groupQty = rows.reduce((s, r) => s + r.quantity, 0)
            const groupIds = rows.map(r => r.id)
            const allGroupSelected = groupIds.length > 0 && groupIds.every(id => selected.has(id))
            const someGroupSelected = groupIds.some(id => selected.has(id))
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
                    {someGroupSelected && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">
                        {groupIds.filter(id => selected.has(id)).length}건 선택
                      </span>
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 overflow-auto">
                    <table className="w-full text-sm" style={{ minWidth: '700px' }}>
                      <thead>
                        <tr className="bg-slate-50/80 text-xs">
                          {isAdmin && (
                            <th className="px-3 py-2 w-8">
                              <input
                                type="checkbox"
                                checked={allGroupSelected}
                                ref={el => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected }}
                                onChange={() => toggleGroupSelect(rows)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                              />
                            </th>
                          )}
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-16">발주일</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">제품명</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">색상/사이즈</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-12">수량</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">수령인</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">MALL</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">메모</th>
                          {isAdmin && <th className="px-4 py-2 w-16"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map(order => (
                          <OrderRow
                            key={order.id}
                            order={order}
                            selected={selected.has(order.id)}
                            onToggle={() => toggleSelect(order.id)}
                            onDelete={() => handleDeleteOrder(order.id)}
                            onUpdated={updated => setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))}
                            isAdmin={isAdmin}
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
            const groupIds = rows.map(r => r.id)
            const allGroupSelected = groupIds.length > 0 && groupIds.every(id => selected.has(id))
            const someGroupSelected = groupIds.some(id => selected.has(id))
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
                    {someGroupSelected && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">
                        {groupIds.filter(id => selected.has(id)).length}건 선택
                      </span>
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 overflow-auto">
                    <table className="w-full text-sm" style={{ minWidth: '620px' }}>
                      <thead>
                        <tr className="bg-slate-50/80 text-xs">
                          {isAdmin && (
                            <th className="px-3 py-2 w-8">
                              <input type="checkbox" checked={allGroupSelected}
                                ref={el => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected }}
                                onChange={() => toggleInvGroupSelect(rows)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer" />
                            </th>
                          )}
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-16">날짜</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">제품명</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">색상/사이즈</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-12">수량</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500 w-16">유형</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">메모</th>
                          {isAdmin && <th className="px-4 py-2 w-16"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map(item => (
                          <InventoryRow
                            key={item.id}
                            item={item}
                            selected={selected.has(item.id)}
                            onToggle={() => toggleSelect(item.id)}
                            onDelete={() => handleDeleteInvItem(item.id)}
                            onUpdated={updated => setInv(prev => prev.map(i => i.id === updated.id ? updated : i))}
                            isAdmin={isAdmin}
                          />
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
