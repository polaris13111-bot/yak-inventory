import { useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, ClipboardList, PackagePlus,
  History, Settings, Lock, LockOpen, Eye, X, ShieldCheck, BarChart2,
  Boxes, PackageCheck, Archive, ListOrdered,
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import StockCalendar from './pages/StockCalendar'
import OrderInput from './pages/OrderInput'
import InventoryManage from './pages/InventoryManage'
import HistoryPage from './pages/History'
import SettingsPage from './pages/Settings'
import Analytics from './pages/Analytics'
import StockStatus from './pages/StockStatus'
import InboundStatus from './pages/InboundStatus'
import BackupPage from './pages/Backup'
import PickingList from './pages/PickingList'
import { AdminProvider, useAdmin } from './context/AdminContext'

// ─── 네비 정의 ────────────────────────────────────────────
// 조회 — 뷰어/관리자 공통
const VIEW_NAV = [
  { to: '/',          icon: LayoutDashboard, label: '대시보드'  },
  { to: '/calendar',  icon: CalendarDays,    label: '출고 현황' },
  { to: '/stock',     icon: Boxes,           label: '현재고'    },
  { to: '/inbound',   icon: PackageCheck,    label: '입고 현황' },
  { to: '/analytics', icon: BarChart2,       label: '판매 분석' },
]
// 작업 — 뷰어: 피킹만 / 관리자: 발주+입고+피킹
const WORK_NAV_VIEWER = [
  { to: '/picking',   icon: ListOrdered,   label: '피킹 리스트' },
]
const WORK_NAV_ADMIN = [
  { to: '/order',     icon: ClipboardList, label: '발주 입력'   },
  { to: '/inventory', icon: PackagePlus,   label: '입고 관리'   },
  { to: '/picking',   icon: ListOrdered,   label: '피킹 리스트' },
]
// 관리 — 관리자 전용
const ADMIN_MANAGE_NAV = [
  { to: '/history',  icon: History,  label: '내역 관리' },
  { to: '/settings', icon: Settings, label: '상품목록'  },
  { to: '/backup',   icon: Archive,  label: '백업·복원' },
]

// ─── 비밀번호 모달 (사이드바 관리자 전환용) ──────────────
function PasswordModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [pw, setPw]       = useState('')
  const [error, setError] = useState(false)
  const { loginAdmin }    = useAdmin()
  const inputRef          = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await loginAdmin(pw)) { onSuccess() }
    else { setError(true); setPw(''); setTimeout(() => setError(false), 1500) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-80 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-slate-700" />
            <h3 className="font-bold text-slate-800">관리자 인증</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef} type="password" value={pw}
            onChange={e => setPw(e.target.value)} placeholder="••••"
            autoComplete="current-password"
            className={`w-full border rounded-lg px-3 py-2.5 text-sm text-center tracking-widest
              focus:outline-none focus:ring-2 transition-all
              ${error ? 'border-red-300 bg-red-50 focus:ring-red-300' : 'border-slate-200 focus:ring-blue-400'}`}
          />
          {error && <p className="text-xs text-red-500 text-center">비밀번호가 틀렸습니다</p>}
          <button type="submit"
            className="w-full py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-colors text-sm">
            관리자 모드 진입
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── 모바일 하단 탭 ───────────────────────────────────────
// 공통 1번째 줄 (조회)
const COMMON_MOBILE_NAV = [
  { to: '/',          icon: LayoutDashboard, label: '대시보드' },
  { to: '/calendar',  icon: CalendarDays,    label: '출고'     },
  { to: '/stock',     icon: Boxes,           label: '재고'     },
  { to: '/inbound',   icon: PackageCheck,    label: '입고현황' },
  { to: '/analytics', icon: BarChart2,       label: '분석'     },
]

function BottomNav({ onAdminToggle, isAdmin, isViewer }: { onAdminToggle: () => void; isAdmin: boolean; isViewer: boolean }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 md:hidden">

      {/* 피킹 리스트 배너 — 뷰어/관리자 공통 2번째 줄 */}
      {(isAdmin || isViewer) && (
        <NavLink to="/picking"
          className={({ isActive }) =>
            `flex items-center justify-center gap-2 py-2 border-b text-xs font-medium transition-colors
             ${isActive
               ? 'bg-blue-600 text-white border-blue-600'
               : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'}`}>
          <ListOrdered size={14} />
          피킹 리스트
        </NavLink>
      )}

      {/* 공통 조회 탭 (1번째 줄) */}
      <div className="flex items-center">
        {COMMON_MOBILE_NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 gap-0.5 text-[10px] font-medium transition-colors
               ${isActive
                 ? isAdmin ? 'text-amber-600' : 'text-blue-600'
                 : 'text-slate-400 hover:text-slate-600'}`}>
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
        {/* 모드 전환 버튼 */}
        <button onClick={onAdminToggle}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-[10px] font-medium transition-colors
            ${isAdmin ? 'text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}>
          {isAdmin ? <LockOpen size={19} /> : <Lock size={19} />}
          {isAdmin ? '관리자' : '뷰어'}
        </button>
      </div>
    </nav>
  )
}

// ─── 사이드바 + 레이아웃 ──────────────────────────────────
function Layout() {
  const { isAdmin, isViewer, logout } = useAdmin()
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="flex h-screen bg-slate-50">
      {showModal && (
        <PasswordModal onClose={() => setShowModal(false)} onSuccess={() => setShowModal(false)} />
      )}

      {/* 사이드바 — 데스크탑만 */}
      <aside className="hidden md:flex w-56 bg-white border-r border-slate-200 flex-col shadow-sm">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏔️</span>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">
                {import.meta.env.VITE_APP_NAME || '야크 재고관리'}
              </p>
              <p className="text-xs text-slate-400">
                {import.meta.env.VITE_APP_SUB || '블랙야크 위탁판매'}
              </p>
            </div>
          </div>
          <button
            onClick={() => isAdmin ? logout() : setShowModal(true)}
            className={`mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all
              ${isAdmin
                ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
                : 'bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
            <span className="flex items-center gap-1.5">
              {isAdmin ? <><LockOpen size={13} />관리자 모드</> : <><Eye size={13} />뷰어 모드</>}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-bold
              ${isAdmin ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>
              {isAdmin ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">

          {/* 조회 섹션 */}
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">조회</p>
            <div className="space-y-0.5">
              {VIEW_NAV.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                     ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                  <Icon size={17} />{label}
                </NavLink>
              ))}
            </div>
          </div>

          {/* 작업 섹션 — 뷰어/관리자 공통 (내용만 다름) */}
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">작업</p>
            <div className="space-y-0.5">
              {(isAdmin ? WORK_NAV_ADMIN : WORK_NAV_VIEWER).map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                     ${isActive
                       ? isAdmin ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                       : isAdmin
                         ? 'text-slate-600 hover:bg-amber-50/60 hover:text-amber-700'
                         : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                  <Icon size={17} />{label}
                </NavLink>
              ))}
            </div>
          </div>

          {/* 관리 섹션 — 관리자 전용 */}
          {isAdmin && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-widest">관리</p>
              <div className="space-y-0.5">
                {ADMIN_MANAGE_NAV.map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                       ${isActive ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-amber-50/60 hover:text-amber-700'}`}>
                    <Icon size={17} />{label}
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          {/* 비로그인 안내 */}
          {!isAdmin && !isViewer && (
            <div className="px-3 py-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <p className="text-xs text-slate-400 leading-relaxed">
                <Lock size={11} className="inline mr-1 mb-0.5" />
                로그인하면 더 많은 메뉴를<br />사용할 수 있습니다
              </p>
            </div>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400 px-3 pt-1">
            {import.meta.env.VITE_APP_SUB || '뉴페이스'} © 2026
          </p>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className={`flex-1 overflow-auto md:pb-0 ${(isAdmin || isViewer) ? 'pb-24' : 'pb-16'}`}>
        <Routes>
          <Route path="/"          element={<Dashboard />} />
          <Route path="/calendar"  element={<StockCalendar />} />
          <Route path="/stock"     element={<StockStatus />} />
          <Route path="/inbound"   element={<InboundStatus />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/order"     element={isAdmin ? <OrderInput />        : <Unauthorized />} />
          <Route path="/inventory" element={isAdmin ? <InventoryManage />   : <Unauthorized />} />
          <Route path="/history"   element={isAdmin ? <HistoryPage />       : <Unauthorized />} />
          <Route path="/settings"  element={isAdmin ? <SettingsPage />      : <Unauthorized />} />
          <Route path="/backup"    element={isAdmin ? <BackupPage />        : <Unauthorized />} />
          <Route path="/picking"   element={(isAdmin || isViewer) ? <PickingList /> : <Unauthorized />} />
        </Routes>
      </main>

      {/* 모바일 하단 탭 */}
      <BottomNav
        isAdmin={isAdmin}
        isViewer={isViewer}
        onAdminToggle={() => isAdmin ? logout() : setShowModal(true)}
      />
    </div>
  )
}

function Unauthorized() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4">
      <Lock size={40} className="text-slate-300" />
      <div>
        <p className="text-lg font-bold text-slate-600">관리자 전용 페이지</p>
        <p className="text-sm text-slate-400 mt-1 hidden md:block">사이드바에서 관리자 모드를 활성화하세요</p>
        <p className="text-sm text-slate-400 mt-1 md:hidden">하단 탭 오른쪽 모드 버튼에서 전환하세요</p>
      </div>
    </div>
  )
}

// ─── 비밀번호 폼 (EntryScreen 밖에 정의 — IME 포커스 버그 방지) ──
// 주의: 이 컴포넌트를 EntryScreen 안에 넣으면 pw state 변경마다
//       React가 새 컴포넌트로 인식해 언마운트/재마운트 → 포커스 소실 발생.
interface PwFormProps {
  onSubmit: (e: React.FormEvent) => void
  color: 'blue' | 'amber'
  pw: string
  setPw: (v: string) => void
  error: boolean
  onBack: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

function PwForm({ onSubmit, color, pw, setPw, error, onBack, inputRef }: PwFormProps) {
  return (
    <form onSubmit={onSubmit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Lock size={16} className="text-slate-600" />
        <p className="font-semibold text-slate-800 text-sm">비밀번호 입력</p>
      </div>
      <input
        ref={inputRef}
        type="password"
        value={pw}
        onChange={e => setPw(e.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
        className={`w-full border rounded-xl px-4 py-3 text-center text-lg tracking-widest
          focus:outline-none focus:ring-2 transition-all
          ${error
            ? 'border-red-300 bg-red-50 focus:ring-red-300'
            : color === 'amber'
            ? 'border-slate-200 focus:ring-amber-400'
            : 'border-slate-200 focus:ring-blue-400'}`}
      />
      {error && <p className="text-xs text-red-500 text-center">비밀번호가 틀렸습니다</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onBack}
          className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          뒤로
        </button>
        <button type="submit"
          className={`flex-1 py-2.5 text-white font-semibold rounded-xl transition-colors text-sm
            ${color === 'amber' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600'}`}>
          입장
        </button>
      </div>
    </form>
  )
}

// ─── 시작 화면 ────────────────────────────────────────────
function EntryScreen({ onEnter }: { onEnter: () => void }) {
  const [step, setStep]   = useState<'select' | 'viewer-pw' | 'admin-pw'>('select')
  const [pw, setPw]       = useState('')
  const [error, setError] = useState(false)
  const { loginAdmin, loginViewer } = useAdmin()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step !== 'select') inputRef.current?.focus()
  }, [step])

  const handleViewer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await loginViewer(pw)) { onEnter() }
    else { setError(true); setPw(''); setTimeout(() => setError(false), 1500) }
  }

  const handleAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await loginAdmin(pw)) { onEnter() }
    else { setError(true); setPw(''); setTimeout(() => setError(false), 1500) }
  }

  const handleBack = () => { setStep('select'); setPw(''); setError(false) }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="text-center space-y-1">
          <div className="text-5xl mb-3">🏔️</div>
          <h1 className="text-2xl font-bold text-slate-800">
            {import.meta.env.VITE_APP_NAME || '야크 재고관리'}
          </h1>
          <p className="text-sm text-slate-400">
            {import.meta.env.VITE_APP_SUB || '블랙야크 위탁판매'} 관리 시스템
          </p>
        </div>

        {step === 'select' && (
          <div className="space-y-3">
            <button onClick={() => setStep('viewer-pw')}
              className="w-full flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl
                         hover:border-blue-400 hover:bg-blue-50/30 transition-all shadow-sm group">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Eye size={20} className="text-slate-500 group-hover:text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-slate-800 text-sm">뷰어 모드로 입장</p>
                <p className="text-xs text-slate-400 mt-0.5">대시보드·출고 현황 조회 가능</p>
              </div>
            </button>

            <button onClick={() => setStep('admin-pw')}
              className="w-full flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl
                         hover:border-amber-400 hover:bg-amber-50/30 transition-all shadow-sm group">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                <ShieldCheck size={20} className="text-amber-500" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-slate-800 text-sm">관리자 모드로 입장</p>
                <p className="text-xs text-slate-400 mt-0.5">내역·발주·입고·설정 포함 전체 접근</p>
              </div>
            </button>
          </div>
        )}

        {step === 'viewer-pw' && (
          <PwForm
            onSubmit={handleViewer} color="blue"
            pw={pw} setPw={setPw} error={error}
            onBack={handleBack} inputRef={inputRef}
          />
        )}
        {step === 'admin-pw' && (
          <PwForm
            onSubmit={handleAdmin} color="amber"
            pw={pw} setPw={setPw} error={error}
            onBack={handleBack} inputRef={inputRef}
          />
        )}
      </div>
    </div>
  )
}

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

function AppInner() {
  const [entered, setEntered] = useState(() =>
    SKIP_AUTH || sessionStorage.getItem('yak-entered') === '1'
  )

  const handleEnter = () => {
    sessionStorage.setItem('yak-entered', '1')
    setEntered(true)
  }

  if (!entered) return <EntryScreen onEnter={handleEnter} />

  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AdminProvider>
      <AppInner />
    </AdminProvider>
  )
}
