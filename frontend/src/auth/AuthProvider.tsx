import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, loadTokens, onTokensChange, saveTokens } from '../lib/api'
import { keys } from '../lib/queries'
import type { AdminUser } from '../lib/types'

interface AuthState {
  user: AdminUser | null
  loading: boolean
  isSuperadmin: boolean
  login: (username: string, password: string) => Promise<AdminUser>
  logout: () => void
  /** True when the user can manage the given game. */
  canManage: (gameId: number | null | undefined) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

interface LoginResponse {
  access: string
  refresh: string
  admin: AdminUser
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [hasTokens, setHasTokens] = useState(() => loadTokens() !== null)

  useEffect(() => onTokensChange((tokens) => setHasTokens(tokens !== null)), [])

  const me = useQuery({
    queryKey: keys.me,
    queryFn: () => api<AdminUser>('admin/me/'),
    enabled: hasTokens,
    retry: false,
    staleTime: 5 * 60_000,
  })

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await api<LoginResponse>('admin/login/', {
        method: 'POST',
        body: { username, password },
        auth: false,
      })
      saveTokens({ access: data.access, refresh: data.refresh })
      queryClient.setQueryData(keys.me, data.admin)
      return data.admin
    },
    [queryClient],
  )

  const logout = useCallback(() => {
    // Revoke the refresh token on the server; the local session ends anyway.
    const tokens = loadTokens()
    if (tokens) api('admin/logout/', { method: 'POST', body: { refresh: tokens.refresh }, auth: false }).catch(() => {})
    saveTokens(null)
    queryClient.clear()
  }, [queryClient])

  const user = hasTokens ? (me.data ?? null) : null

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading: hasTokens && me.isPending,
      isSuperadmin: user?.role === 'superadmin',
      login,
      logout,
      canManage: (gameId) =>
        !!user && (user.role === 'superadmin' || (!!gameId && user.games.some((game) => game.id === gameId))),
    }),
    [user, hasTokens, me.isPending, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
