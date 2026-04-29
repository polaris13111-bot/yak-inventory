import { useState, useEffect } from 'react'
import { Settings2, Package, Plus, Trash2, Pencil, Check, X, Eye, EyeOff } from 'lucide-react'
import { getProducts, createProduct, updateProduct, deleteProduct, toggleProductActive } from '../api'
import type { Product } from '../types'

// ─── 상품 추가/편집 모달 ──────────────────────────────────
interface ProductForm {
  name: string
  color: string
  size: string
  model_code: string
  barcode: string
}

function ProductModal({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Product
  onSave: (data: ProductForm) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<ProductForm>({
    name:       initial?.name       ?? '',
    color:      initial?.color      ?? '',
    size:       initial?.size       ?? '',
    model_code: initial?.model_code ?? '',
    barcode:    initial?.barcode    ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k: keyof ProductForm, v: string) => setForm(p => ({ ...p, [k]: v }))
  const valid = form.name.trim() && form.color.trim() && form.size.trim()

  const handleSave = async () => {
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await onSave(form)
    } catch {
      setError('저장에 실패했습니다.')
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof ProductForm, placeholder: string, required = false) => (
    <div>
      <label className="text-xs font-medium text-slate-500 block mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">{initial ? '상품 수정' : '상품 추가'}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={17} /></button>
        </div>

        {field('제품명', 'name', '예) H티아고 자켓', true)}
        <div className="grid grid-cols-2 gap-3">
          {field('색상', 'color', '예) 블랙', true)}
          {field('사이즈', 'size', '예) 95', true)}
        </div>
        {field('모델코드', 'model_code', '예) 8BYAJF3904 (선택)')}
        {field('바코드', 'barcode', '스캐너로 찍거나 직접 입력 (선택)')}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm hover:bg-slate-50 transition-colors">
            취소
          </button>
          <button onClick={handleSave} disabled={!valid || saving}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold
                       hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors">
            {saving ? '저장 중...' : <><Check size={14} className="inline mr-1" />저장</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 상품 목록 탭 ─────────────────────────────────────────
function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch]     = useState('')
  const [modal, setModal]       = useState<'new' | Product | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [toggling, setToggling] = useState<number | null>(null)

  const load = () => getProducts().then(setProducts)
  useEffect(() => { load() }, [])

  const filtered = products.filter(p =>
    `${p.name} ${p.color} ${p.size} ${p.model_code ?? ''}`.toLowerCase().includes(search.toLowerCase())
  )

  // 제품명 기준 그룹핑
  const grouped = filtered.reduce<Record<string, Product[]>>((acc, p) => {
    if (!acc[p.name]) acc[p.name] = []
    acc[p.name].push(p)
    return acc
  }, {})

  const handleSave = async (data: ProductForm) => {
    if (modal === 'new') {
      await createProduct({ ...data, active: true })
    } else if (modal && typeof modal === 'object') {
      await updateProduct(modal.id, { ...data, active: modal.active })
    }
    setModal(null)
    load()
  }

  const handleToggleActive = async (p: Product) => {
    setToggling(p.id)
    try {
      await toggleProductActive(p.id)
      load()
    } catch {
      alert('상태 변경에 실패했습니다.')
    }
    setToggling(null)
  }

  const handleDelete = async (p: Product) => {
    if (!confirm(`"${p.name} / ${p.color} / ${p.size}"을 삭제할까요?\n연결된 발주/입고 내역이 있으면 삭제되지 않을 수 있습니다.`)) return
    setDeleting(p.id)
    try {
      await deleteProduct(p.id)
      load()
    } catch {
      alert('삭제 실패: 해당 상품에 연결된 발주/입고 내역이 있습니다.')
    }
    setDeleting(null)
  }

  return (
    <div className="space-y-4">
      {modal && (
        <ProductModal
          initial={modal === 'new' ? undefined : modal}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}

      {/* 툴바 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-500">
            총 <span className="font-bold text-slate-800">{products.length}</span>개 품목
          </p>
          {search && (
            <span className="text-xs text-slate-400">· 검색결과 {filtered.length}개</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="제품명, 색상, 사이즈, 모델코드"
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-64
                       focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
                       hover:bg-blue-700 transition-colors">
            <Plus size={15} />상품 추가
          </button>
        </div>
      </div>

      {/* 그룹별 상품 목록 */}
      <div className="space-y-3">
        {Object.entries(grouped).length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 p-12 text-center text-slate-400 text-sm">
            {search ? '검색 결과 없음' : '등록된 상품이 없습니다'}
          </div>
        ) : (
          Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b, 'ko'))
            .map(([name, items]) => (
              <div key={name} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                {/* 그룹 헤더 */}
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-slate-400" />
                    <span className="text-sm font-semibold text-slate-700">{name}</span>
                    <span className="text-xs text-slate-400">{items.length}개 옵션</span>
                  </div>
                </div>
                {/* 옵션 행 */}
                <div className="divide-y divide-slate-50">
                  {items.map(p => (
                    <div key={p.id}
                      className={`flex items-center justify-between px-4 py-2.5 transition-colors group ${
                        p.active ? 'hover:bg-slate-50/60' : 'bg-slate-50/60 opacity-55 hover:opacity-80'
                      }`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-300 w-8 text-right font-mono">{p.id}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-700 font-medium">{p.color}</span>
                          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">
                            {p.size}
                          </span>
                          {p.model_code && (
                            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-500 rounded font-mono">
                              {p.model_code}
                            </span>
                          )}
                          {p.barcode && (
                            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded font-mono">
                              📷 {p.barcode}
                            </span>
                          )}
                          {!p.active && (
                            <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded font-medium">비활성</span>
                          )}
                        </div>
                      </div>
                      {/* 액션 버튼 — 비활성 항목은 항상 표시, 활성 항목은 hover 시 표시 */}
                      <div className={`flex items-center gap-1 transition-opacity ${p.active ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                        <button
                          onClick={() => handleToggleActive(p)}
                          disabled={toggling === p.id}
                          title={p.active ? '비활성화' : '활성화'}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                            p.active
                              ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                              : 'text-amber-500 hover:text-emerald-500 hover:bg-emerald-50'
                          }`}>
                          {p.active ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                          onClick={() => setModal(p)}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deleting === p.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}

// ─── 메인 ─────────────────────────────────────────────────
export default function Settings() {
  return (
    <div className="p-3 md:p-6 max-w-5xl space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Settings2 size={22} />설정
        </h1>
        <p className="text-sm text-slate-400 mt-1">등록된 상품 관리 — 추가, 수정, 삭제</p>
      </div>

      <ProductsTab />
    </div>
  )
}
