import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { clearToken, getToken, setToken } from '../api/client'
import { fetchMe, login as loginRequest } from '../api/endpoints'
import type { AdminMe } from '../api/types'

interface AuthState {
  me: AdminMe | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AdminMe | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 刷新页面后用 sessionStorage 里的 token 复活会话。
    // token 过期或账号被停用时 /me 会 401/403，这里静默登出。
    if (!getToken()) {
      setLoading(false)
      return
    }
    fetchMe()
      .then(setMe)
      .catch(() => {
        clearToken()
        setMe(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const { access_token } = await loginRequest(username, password)
    setToken(access_token)
    setMe(await fetchMe())
  }, [])

  const signOut = useCallback(() => {
    clearToken()
    setMe(null)
  }, [])

  return (
    <AuthContext.Provider value={{ me, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
