/**
 * 야크 재고관리 - 상품 매칭 엔진
 * product-matching-react/backend/matcher.js 알고리즘 이식
 *
 * 자동 매칭 (autoMatch):
 *   1단계 - 상품명 완전 일치 (원본 그대로)
 *   2단계 - 모델코드 포함 (4글자 이상)
 *
 * 수동 매칭 후보 (findCandidates):
 *   정규화된 제품명을 정규화된 주문 텍스트 안에서 Fuse.js fuzzy 검색
 *   → 짧은 제품명이 긴 주문명 안에 얼마나 포함되는지 유사도 측정
 */

import Fuse from 'fuse.js'
import type { Product } from '../types'

export interface MatchResult {
  product: Product
  score: number       // 0~100
  matchType: string   // '100%일치' | '모델코드포함' | 'fuzzy' | 'manual'
}

/**
 * 색상 정규화 — 영문·이형 표기를 정식 한글 색상명으로 통일
 * 적용 순서: stripNoise → normalizeColors → normalizeString
 */
const COLOR_ALIASES: [RegExp, string][] = [
  // 블랙
  [/\bblack\b/gi,          '블랙'],
  [/검정색?|검은색?/g,       '블랙'],
  [/블랙계열/g,             '블랙'],
  // 화이트
  [/\bwhite\b/gi,           '화이트'],
  [/\bivory\b/gi,           '화이트'],
  [/흰색?|하얀색?|아이보리/g, '화이트'],
  // 그레이
  [/\bgr[ae]y\b/gi,         '그레이'],
  [/\bsilver\b/gi,          '그레이'],
  [/회색|실버/g,             '그레이'],
  // 네이비
  [/\bnavy\b/gi,            '네이비'],
  [/남색/g,                 '네이비'],
  // 카키
  [/\bkhaki\b/gi,           '카키'],
  [/\bolive\b/gi,           '카키'],
  [/올리브/g,               '카키'],
  // 레드
  [/\bred\b/gi,             '레드'],
  [/빨간색?|빨강/g,          '레드'],
  // 블루
  [/\bblue\b/gi,            '블루'],
  [/파란색?|파랑/g,          '블루'],
  // 베이지
  [/\bbeige\b/gi,           '베이지'],
  // 브라운
  [/\bbrown\b/gi,           '브라운'],
  [/갈색/g,                 '브라운'],
  // 옐로우
  [/\byellow\b/gi,          '옐로우'],
  [/노란색?|노랑/g,          '옐로우'],
  // 오렌지
  [/\borange\b/gi,          '오렌지'],
  // 퍼플
  [/\bpurple\b/gi,          '퍼플'],
  [/보라색?|보라/g,          '퍼플'],
  // 그린
  [/\bgreen\b/gi,           '그린'],
  [/초록색?|초록/g,          '그린'],
  // 핑크
  [/\bpink\b/gi,            '핑크'],
  [/분홍색?|분홍/g,          '핑크'],
]

export function normalizeColors(text: string): string {
  if (!text) return ''
  let t = text
  for (const [pattern, canonical] of COLOR_ALIASES) {
    t = t.replace(pattern, canonical)
  }
  return t
}

/**
 * 브랜드/노이즈 제거
 * - "블랙야크" (4글자 복합어) 제거 → "블랙" (색상, 2글자)은 유지
 * - 괄호 안 내용, 대괄호 내용, 사이즈:/size: 레이블 제거
 */
export function stripNoise(text: string): string {
  if (!text) return ''
  return text
    .replace(/블랙야크/g, '')          // 브랜드명 제거 ("블랙" 색상은 건드리지 않음)
    .replace(/\([^)]*\)/g, '')         // (남여공용), (남성용) 등 괄호 제거
    .replace(/\[[^\]]*\]/g, '')        // [대괄호 내용] 제거
    .replace(/사이즈[:：]?\s*/gi, '')  // "사이즈:" 레이블 제거
    .replace(/size[:：]?\s*/gi, '')    // "size:" 레이블 제거
    .replace(/\s{2,}/g, ' ')          // 연속 공백 → 단일 공백
    .trim()
}

/**
 * 문자열 정규화
 * - 줄바꿈/공백/특수문자 제거, 소문자 변환 (한글·영문·숫자만 유지)
 */
export function normalizeString(text: string): string {
  if (!text) return ''
  return String(text)
    .trim()
    .replace(/[\n\r\t]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '')
}

/**
 * 두 문자열 유사도 (0~100)
 * str1을 쿼리로, str2를 문서로 검색
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  const fuse = new Fuse([str2], { includeScore: true, threshold: 1.0 })
  const result = fuse.search(str1)
  if (!result.length) return 0
  return Math.round((1 - (result[0].score ?? 1)) * 1000) / 10
}

/**
 * 자동 매칭 — 원본 autoMatchProducts 로직
 *   1. 상품명 100% 완전 일치 (공백/슬래시 형식 모두 허용)
 *   2. 모델코드가 주문 텍스트 안에 포함 (4글자 이상)
 */
export function autoMatch(
  productName: string,
  products: Product[]
): MatchResult | null {
  if (!productName.trim()) return null

  const stripped    = stripNoise(productName)
  const normalized  = normalizeString(normalizeColors(stripped))

  for (const p of products) {
    const fullName  = `${p.name} ${p.color} ${p.size}`
    const slashName = `${p.name} / ${p.color} / ${p.size}`

    // 1단계: 원본 완전 일치
    if (
      productName.trim() === fullName.trim() ||
      productName.trim() === slashName.trim()
    ) {
      return { product: p, score: 100, matchType: '100%일치' }
    }

    // 2단계: 모델코드 포함 (4글자 이상 — "90" 같은 짧은 코드 오탐 방지)
    if (p.model_code?.trim()) {
      const normModel = normalizeString(p.model_code)
      if (normModel.length >= 4 && normalized.includes(normModel)) {
        return { product: p, score: 100, matchType: '모델코드포함' }
      }
    }
  }

  return null
}

/**
 * 수동 매칭 후보 — 원본 findMatchingProducts 로직
 *
 * 핵심: "짧은 제품명"을 쿼리로, "긴 주문 텍스트"를 문서로 검색
 * (반대 방향: 긴 쿼리 → 짧은 문서는 매칭률이 낮아짐)
 */
export function findCandidates(
  productName: string,
  products: Product[],
  topN = 5,
  threshold = 30
): MatchResult[] {
  if (!productName.trim()) return []

  // 브랜드/노이즈 제거 + 색상 정규화 후 normalize → Fuse 인스턴스의 "문서"
  const normalizedOrder = normalizeString(normalizeColors(stripNoise(productName)))

  const fuse = new Fuse([normalizedOrder], {
    includeScore: true,
    threshold: 1.0,
    minMatchCharLength: 2,
  })

  const candidates: MatchResult[] = []

  for (const p of products) {
    // 제품 전체명 색상 정규화 후 normalize → 쿼리 (짧은 쪽)
    const productFull = normalizeString(normalizeColors(`${p.name} ${p.color} ${p.size}`))

    const result = fuse.search(productFull)
    const score  = result.length
      ? Math.round((1 - (result[0].score ?? 1)) * 1000) / 10
      : 0

    if (score >= threshold) {
      candidates.push({ product: p, score, matchType: 'fuzzy' })
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}

/**
 * 유사도 등급 레이블
 */
export function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: '높음', color: 'text-green-600 bg-green-50' }
  if (score >= 70) return { label: '중간', color: 'text-amber-600 bg-amber-50' }
  return             { label: '낮음', color: 'text-red-500 bg-red-50' }
}

/**
 * 매칭 타입 배지 색상
 */
export function matchTypeBadge(matchType: string): string {
  switch (matchType) {
    case '100%일치':    return 'bg-green-100 text-green-700'
    case '모델코드포함': return 'bg-blue-100 text-blue-700'
    case 'manual':      return 'bg-purple-100 text-purple-700'
    default:            return 'bg-slate-100 text-slate-500'
  }
}
