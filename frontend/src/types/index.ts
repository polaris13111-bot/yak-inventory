export interface Product {
  id: number
  name: string
  color: string
  size: string
  model_code: string
  active: boolean
}

export interface Order {
  id: number
  date: string
  product_id: number
  product?: Product
  quantity: number
  order_date: string
  storage: string
  mall: string
  orderer: string
  recipient: string
  phone: string
  address: string
  memo: string
  created_at: string
}

export interface InventoryItem {
  id: number
  date: string
  product_id: number
  product?: Product
  quantity: number
  type: 'normal' | 'return'
  notes: string
  created_at: string
}

export interface StockSummary {
  product: Product
  total_in: number
  total_out: number
  current_stock: number
  low_stock: boolean
}

export interface DailyOutbound {
  date: string
  product_id: number
  quantity: number
}

export interface MappingRule {
  id: number
  rule_name: string
  product_id: number | null
  product?: Product
  match_type: 'and' | 'or'
  keywords: string[]
  enabled: boolean
  priority: number
  created_at: string
}
