import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface AdminContextType {
  isAdmin: boolean
  login: (password: string) => boolean
  logout: () => void
}

const ADMIN_PASSWORD = '0000'

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  login: () => false,
  logout: () => {},
})

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)

  const login = useCallback((pw: string) => {
    if (pw === ADMIN_PASSWORD) {
      setIsAdmin(true)
      return true
    }
    return false
  }, [])

  const logout = useCallback(() => setIsAdmin(false), [])

  return (
    <AdminContext.Provider value={{ isAdmin, login, logout }}>
      {children}
    </AdminContext.Provider>
  )
}

export const useAdmin = () => useContext(AdminContext)
