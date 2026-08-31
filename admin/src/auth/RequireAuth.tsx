import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth } from './useAuth'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>载入中…</div>

  // 把原本要去的页面记进 state，登录成功后 LoginPage 会送回那里。
  // 不记的话，从书签直接打开 /art 被拦下、登录完只会落到默认页。
  if (!me) return <Navigate to="/login" replace state={{ from: location }} />

  return <>{children}</>
}
