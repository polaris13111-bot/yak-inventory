import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface AdminContextType {
  isAdmin: boolean
  isViewer: boolean
  loginAdmin: (password: string) => boolean
  loginViewer: (password: string) => boolean
  login: (password: string) => boolean  // 기존 호환
  logout: () => void
}

const ADMIN_PASSWORD  = 'newface'
const VIEWER_PASSWORD = 'blackyak'

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  isViewer: false,
  loginAdmin: () => false,
  loginViewer: () => false,
  login: () => false,
  logout: () => {},
})

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin]   = useState(false)
  const [isViewer, setIsViewer] = useState(false)

  const loginAdmin = useCallback((pw: string) => {
    if (pw === ADMIN_PASSWORD) { setIsAdmin(true); setIsViewer(false); return true }
    return false
  }, [])

  const loginViewer = useCallback((pw: string) => {
    if (pw === VIEWER_PASSWORD) { setIsViewer(true); setIsAdmin(false); return true }
    return false
  }, [])

  const login = loginAdmin  // 기존 PasswordModal 호환

  const logout = useCallback(() => { setIsAdmin(false); setIsViewer(false) }, [])

  return (
    <AdminContext.Provider value={{ isAdmin, isViewer, loginAdmin, loginViewer, login, logout }}>
      {children}
    </AdminContext.Provider>
  )
}

export const useAdmin = () => useContext(AdminContext)
