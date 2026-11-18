import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, endSession, hasAccessToken, mayHaveSession, onAccessTokenChange, refreshAccess, setAccessToken } from '../lib/api'
import { keys } from '../lib/queries'
import type { AdminUser, Id } from '../lib/types'

interface AuthState {
  user: AdminUser | null
  loading: boolean
  isSuperadmin: boolean
  login: (username: string, password: string) => Promise<AdminUser>
  logout: () => void
  /** True when the user can manage the given game. */
  canManage: (gameId: Id | null | undefined) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

/** The refresh token comes in an HttpOnly cookie, never in the body. */
interface LoginResponse {
  access: string
  admin: AdminUser
}

type Session = 'checking' | 'open' | 'closed'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // After a reload only the cookie is left: ask for a new access token
  // (only when this browser had logged in, not for every visitor).
  const [session, setSession] = useState<Session>(() =>
    hasAccessToken() ? 'open' : mayHaveSession() ? 'checking' : 'closed',
  )

  useEffect(() => onAccessTokenChange((token) => setSession(token ? 'open' : 'closed')), [])

  // Only on mount: later refreshes happen when a request gets a 401.
  useEffect(() => {
    if (!hasAccessToken() && mayHaveSession()) {
      // Offline: show the login instead of waiting forever.
      refreshAccess().then((ok) => {
        if (!ok && !hasAccessToken()) setSession('closed')
      })
    }
  }, [])

  const hasTokens = session === 'open'

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
      setAccessToken(data.access)
      queryClient.setQueryData(keys.me, data.admin)
      return data.admin
    },
    [queryClient],
  )

  const logout = useCallback(() => {
    // Revokes the cookie token on the server; the local session ends anyway.
    endSession()
    queryClient.clear()
  }, [queryClient])

  const user = hasTokens ? (me.data ?? null) : null

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading: session === 'checking' || (hasTokens && me.isPending),
      isSuperadmin: user?.role === 'superadmin',
      login,
      logout,
      canManage: (gameId) =>
        !!user && (user.role === 'superadmin' || (!!gameId && user.games.some((game) => game.id === gameId))),
    }),
    [user, session, hasTokens, me.isPending, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
