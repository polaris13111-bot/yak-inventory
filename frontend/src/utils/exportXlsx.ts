import * as XLSX from 'xlsx'
import type { Order, InventoryItem, StockSummary } from '../types'

function autoWidth(ws: XLSX.WorkSheet, data: string[][]) {
  const colWidths = data[0]?.map((_, ci) =>
    Math.max(...data.map(row => String(row[ci] ?? '').length), 8)
  ) ?? []
  ws['!cols'] = colWidths.map(w => ({ wch: Math.min(w + 2, 40) }))
}

// 발주 내역 시트
export function buildOrderSheet(orders: Order[]): XLSX.WorkSheet {
  const header = ['발주일', '주문일자', '제품명', '색상', '사이즈', '수량',
                  '제품보관', 'MALL', '주문자', '수령인', '휴대폰', '주소', '메모']
  const rows = orders.map(o => [
    o.date, o.order_date,
    o.product?.name ?? '', o.product?.color ?? '', o.product?.size ?? '',
    o.quantity, o.storage, o.mall, o.orderer, o.recipient, o.phone, o.address, o.memo,
  ])
  const data = [header, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  autoWidth(ws, data.map(r => r.map(String)))
  return ws
}

// 입고 내역 시트
export function buildInventorySheet(items: InventoryItem[]): XLSX.WorkSheet {
  const header = ['날짜', '제품명', '색상', '사이즈', '수량', '유형', '메모']
  const rows = items.map(i => [
    i.date,
    i.product?.name ?? '', i.product?.color ?? '', i.product?.size ?? '',
    i.quantity, i.type === 'normal' ? '정상' : '반품', i.notes,
  ])
  const data = [header, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  autoWidth(ws, data.map(r => r.map(String)))
  return ws
}

// 재고 현황 시트
export function buildStockSheet(summary: StockSummary[]): XLSX.WorkSheet {
  const header = ['제품명', '색상', '사이즈', '모델코드', '총입고', '총출고', '현재고', '재고부족']
  const rows = summary.map(s => [
    s.product.name, s.product.color, s.product.size, s.product.model_code,
    s.total_in, s.total_out, s.current_stock, s.low_stock ? '부족' : '',
  ])
  const data = [header, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  autoWidth(ws, data.map(r => r.map(String)))
  return ws
}

// 파일 다운로드
export function downloadXlsx(filename: string, sheets: { name: string; ws: XLSX.WorkSheet }[]) {
  const wb = XLSX.utils.book_new()
  for (const { name, ws } of sheets) {
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.writeFile(wb, filename)
}

// 편의 함수들
export function exportOrders(orders: Order[], label = '발주내역') {
  downloadXlsx(`야크_${label}_${today()}.xlsx`, [
    { name: '발주내역', ws: buildOrderSheet(orders) },
  ])
}

export function exportInventory(items: InventoryItem[], label = '입고내역') {
  downloadXlsx(`야크_${label}_${today()}.xlsx`, [
    { name: '입고내역', ws: buildInventorySheet(items) },
  ])
}

export function exportFull(orders: Order[], items: InventoryItem[], summary: StockSummary[], label = '전체') {
  downloadXlsx(`야크_재고관리_${label}_${today()}.xlsx`, [
    { name: '재고현황', ws: buildStockSheet(summary) },
    { name: '발주내역', ws: buildOrderSheet(orders) },
    { name: '입고내역', ws: buildInventorySheet(items) },
  ])
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
}
