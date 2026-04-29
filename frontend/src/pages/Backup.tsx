import { useState, useRef } from 'react'
import { Download, Upload, AlertTriangle, CheckCircle } from 'lucide-react'

export default function BackupPage() {
  const [mode, setMode]       = useState<'append' | 'reset'>('append')
  const [file, setFile]       = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<{ orders: number; inventory: number } | null>(null)
  const [error, setError]     = useState('')
  const fileRef               = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const a = document.createElement('a')
    a.href = '/backup/export'
    a.click()
  }

  const handleImport = async () => {
    if (!file) return
    if (mode === 'reset' && !window.confirm('기존 출고·입고 데이터를 전부 삭제하고 가져옵니다.\n계속할까요?')) return

    setLoading(true)
    setResult(null)
    setError('')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', mode)

    try {
      const token = localStorage.getItem('yak_token')
      const res = await fetch('/backup/import', {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || '가져오기 실패')
      setResult(json)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">백업·복원</h1>
        <p className="text-sm text-slate-400 mt-0.5">데이터를 엑셀로 내보내거나 가져옵니다</p>
      </div>

      {/* 내보내기 */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Download size={17} className="text-slate-600" />
          <h2 className="font-semibold text-slate-800 text-sm">내보내기</h2>
        </div>
        <p className="text-sm text-slate-500">
          상품목록 · 출고기록 · 입고기록을 엑셀 파일(xlsx)로 다운로드합니다.
        </p>
        <button onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-900 transition-colors">
          <Download size={14} />엑셀 다운로드
        </button>
      </div>

      {/* 가져오기 */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Upload size={17} className="text-slate-600" />
          <h2 className="font-semibold text-slate-800 text-sm">가져오기</h2>
        </div>

        {/* 모드 선택 */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setMode('append')}
            className={`py-3 px-3 rounded-xl border text-sm font-medium transition-colors text-left
              ${mode === 'append'
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            추가 가져오기
            <span className="block text-xs font-normal mt-0.5 opacity-70">기존 데이터 유지</span>
          </button>
          <button onClick={() => setMode('reset')}
            className={`py-3 px-3 rounded-xl border text-sm font-medium transition-colors text-left
              ${mode === 'reset'
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            초기화 후 가져오기
            <span className="block text-xs font-normal mt-0.5 opacity-70">기존 데이터 삭제</span>
          </button>
        </div>

        {mode === 'reset' && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-600">
              기존 출고·입고 데이터가 전부 삭제됩니다. 상품목록은 유지됩니다.
            </p>
          </div>
        )}

        {/* 파일 선택 */}
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
          onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); setError('') }} />
        <button onClick={() => fileRef.current?.click()}
          className={`w-full py-8 border-2 border-dashed rounded-xl text-sm transition-colors
            ${file
              ? 'border-slate-300 bg-slate-50'
              : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'}`}>
          {file
            ? <span className="text-slate-700 font-medium">{file.name}</span>
            : '클릭하여 xlsx 파일 선택'}
        </button>

        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle size={12} />{error}
          </p>
        )}

        {result && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle size={14} className="text-emerald-600 flex-shrink-0" />
            <p className="text-sm text-emerald-700">
              출고 <strong>{result.orders}건</strong> · 입고 <strong>{result.inventory}건</strong> 가져오기 완료
            </p>
          </div>
        )}

        <button onClick={handleImport} disabled={!file || loading}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40
            ${mode === 'reset'
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'}`}>
          {loading ? '처리 중...' : mode === 'reset' ? '초기화 후 가져오기' : '추가 가져오기'}
        </button>
      </div>
    </div>
  )
}
