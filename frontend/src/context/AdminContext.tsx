import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { loginApi } from '../api'

interface AdminContextType {
  isAdmin: boolean
  isViewer: boolean
  loginAdmin: (password: string) => Promise<boolean>
  loginViewer: (password: string) => Promise<boolean>
  login: (password: string) => Promise<boolean>  // 기존 호환
  logout: () => void
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  isViewer: false,
  loginAdmin: async () => false,
  loginViewer: async () => false,
  login: async () => false,
  logout: () => {},
})

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin]   = useState(() => {
    if (SKIP_AUTH) return true
    return localStorage.getItem('yak_role') === 'admin'
  })
  const [isViewer, setIsViewer] = useState(() => {
    if (SKIP_AUTH) return false
    return localStorage.getItem('yak_role') === 'viewer'
  })

  const loginAdmin = useCallback(async (pw: string): Promise<boolean> => {
    try {
      const { token, role } = await loginApi(pw)
      if (role === 'admin') {
        localStorage.setItem('yak_token', token)
        localStorage.setItem('yak_role', 'admin')
        setIsAdmin(true)
        setIsViewer(false)
        return true
      }
    } catch { /* 비밀번호 틀림 */ }
    return false
  }, [])

  const loginViewer = useCallback(async (pw: string): Promise<boolean> => {
    try {
      const { token, role } = await loginApi(pw)
      if (role === 'viewer' || role === 'admin') {
        localStorage.setItem('yak_token', token)
        localStorage.setItem('yak_role', role)
        setIsViewer(true)
        setIsAdmin(role === 'admin')
        return true
      }
    } catch { /* 비밀번호 틀림 */ }
    return false
  }, [])

  const login = loginAdmin  // 기존 PasswordModal 호환

  const logout = useCallback(() => {
    localStorage.removeItem('yak_token')
    localStorage.removeItem('yak_role')
    setIsAdmin(false)
    setIsViewer(false)
  }, [])

  return (
    <AdminContext.Provider value={{ isAdmin, isViewer, loginAdmin, loginViewer, login, logout }}>
      {children}
    </AdminContext.Provider>
  )
}

export const useAdmin = () => useContext(AdminContext)
