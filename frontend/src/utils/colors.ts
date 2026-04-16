export const COLOR_SWATCHES: Record<string, string> = {
  '블랙': '#1a1a1a',
  '화이트': '#f0f0f0',
  '그레이': '#9ca3af',
  '네이비': '#1e3a5f',
  '카키': '#6b7c47',
  '레드': '#ef4444',
  '블루': '#3b82f6',
  '베이지': '#d4b896',
  '브라운': '#92400e',
  '옐로우': '#fbbf24',
  '오렌지': '#f97316',
  '퍼플': '#a855f7',
  '그린': '#22c55e',
  '핑크': '#f472b6',
}

/** 색상명에 대응하는 hex 반환 (미등록 색상은 슬레이트) */
export const getColorHex = (color: string) => COLOR_SWATCHES[color] ?? '#94a3b8'
