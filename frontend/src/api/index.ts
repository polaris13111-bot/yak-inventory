import axios from 'axios'
import type { Product, Order, InventoryItem, StockSummary, DailyOutbound, MappingRule } from '../types'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
})

// ── Bearer 토큰 자동 첨부 ────────────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('yak_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// ── 401 → 토큰 삭제 (로그인 화면으로 돌아가게 됨) ────────
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('yak_token')
      localStorage.removeItem('yak_role')
    }
    return Promise.reject(err)
  }
)

// ── 인증 ─────────────────────────────────────────────────
export const loginApi = (password: string) =>
  api.post<{ token: string; role: 'admin' | 'viewer' }>('/auth/login', { password }).then(r => r.data)

// 제품
export const getProducts = () =>
  api.get<Product[]>('/products').then(r => r.data)

export const createProduct = (data: Omit<Product, 'id'>) =>
  api.post<Product>('/products', data).then(r => r.data)

export const updateProduct = (id: number, data: Omit<Product, 'id'>) =>
  api.put<Product>(`/products/${id}`, data).then(r => r.data)

export const deleteProduct = (id: number) =>
  api.delete(`/products/${id}`)

export const toggleProductActive = (id: number) =>
  api.patch<Product>(`/products/${id}/toggle-active`).then(r => r.data)

// 발주
export const getOrders = (params?: { month?: string; date?: string }) =>
  api.get<Order[]>('/orders', { params }).then(r => r.data)

export const createOrder = (data: Omit<Order, 'id' | 'created_at' | 'product'>) =>
  api.post<Order>('/orders', data).then(r => r.data)

export const updateOrder = (id: number, data: Omit<Order, 'id' | 'created_at' | 'product'>) =>
  api.put<Order>(`/orders/${id}`, data).then(r => r.data)

export const deleteOrder = (id: number) =>
  api.delete(`/orders/${id}`)

export const batchDeleteOrders = (ids: number[]) =>
  api.post('/orders/batch-delete', { ids }).then(r => r.data)

// 입고
export const getInventory = (params?: { month?: string }) =>
  api.get<InventoryItem[]>('/inventory', { params }).then(r => r.data)

export const createInventory = (data: Omit<InventoryItem, 'id' | 'created_at' | 'product'>) =>
  api.post<InventoryItem>('/inventory', data).then(r => r.data)

export const createInventoryBulk = (data: Omit<InventoryItem, 'id' | 'created_at' | 'product'>[]) =>
  api.post<{ ok: number; fail: { product_id: number; reason: string }[] }>('/inventory/bulk', data).then(r => r.data)

export const updateInventory = (id: number, data: Omit<InventoryItem, 'id' | 'created_at' | 'product'>) =>
  api.put<InventoryItem>(`/inventory/${id}`, data).then(r => r.data)

export const deleteInventory = (id: number) =>
  api.delete(`/inventory/${id}`)

export const batchDeleteInventory = (ids: number[]) =>
  api.post('/inventory/batch-delete', { ids }).then(r => r.data)

export const createOrdersBulk = (data: Omit<Order, 'id' | 'created_at' | 'product'>[]) =>
  api.post<{ ok: number; fail: { product_id: number; reason: string }[] }>('/orders/bulk', data).then(r => r.data)

// 재고 현황
export const getStockSummary = (month?: string) =>
  api.get<StockSummary[]>('/stock/summary', { params: { month } }).then(r => r.data)

// 월별 날짜별 출고 현황 (캘린더 그리드용)
export const getDailyOutbound = (month: string) =>
  api.get<DailyOutbound[]>('/stock/daily', { params: { month } }).then(r => r.data)

// 매핑 규칙
export const getMappingRules = () =>
  api.get<MappingRule[]>('/mapping-rules').then(r => r.data)

export const createMappingRule = (data: Omit<MappingRule, 'id' | 'created_at' | 'product'>) =>
  api.post<MappingRule>('/mapping-rules', data).then(r => r.data)

export const updateMappingRule = (id: number, data: Omit<MappingRule, 'id' | 'created_at' | 'product'>) =>
  api.put<MappingRule>(`/mapping-rules/${id}`, data).then(r => r.data)

export const deleteMappingRule = (id: number) =>
  api.delete(`/mapping-rules/${id}`)

export const toggleMappingRule = (id: number) =>
  api.patch<{ id: number; enabled: boolean }>(`/mapping-rules/${id}/toggle`).then(r => r.data)

export const seedDefaultRules = () =>
  api.post('/mapping-rules/seed-defaults').then(r => r.data)

export const resolveProduct = (productName: string) =>
  api.post<{ product_id: number | null; product: Product | null }>(
    '/mapping-rules/resolve', { product_name: productName }
  ).then(r => r.data)
