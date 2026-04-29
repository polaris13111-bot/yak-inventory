import { Info } from 'lucide-react'

export default function ConcurrentWarning() {
  return (
    <div className="relative group inline-flex">
      <Info size={15} className="text-slate-300 hover:text-slate-400 cursor-default transition-colors" />
      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50
                      hidden group-hover:block
                      w-56 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg
                      pointer-events-none">
        동시에 여러 명이 입력하면 충돌할 수 있습니다. 한 번에 한 명씩 사용을 권장합니다.
        <div className="absolute left-1/2 -translate-x-1/2 top-full
                        border-4 border-transparent border-t-slate-800" />
      </div>
    </div>
  )
}
