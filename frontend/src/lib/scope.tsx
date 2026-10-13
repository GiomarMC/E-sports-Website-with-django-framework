import { createContext, useContext, type ReactNode } from 'react'

/**
 * Data scope of the queries. The public site always reads the API as an
 * anonymous visitor (hidden games stay hidden even if an admin is logged in
 * in the same browser); only the admin panel sends the session token.
 */
const AdminScopeContext = createContext(false)

export function AdminScope({ children }: { children: ReactNode }) {
  return <AdminScopeContext.Provider value>{children}</AdminScopeContext.Provider>
}

export function useAdminScope() {
  return useContext(AdminScopeContext)
}
