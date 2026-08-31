import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from './useAuth'

/** 登录后的默认落地页 —— 侧栏的第一项 */
const AFTER_LOGIN = '/config'

export default function LoginPage() {
  const { me, signIn } = useAuth()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setSubmitting(true)
    setError(null)
    try {
      await signIn(username.trim(), password)
    } catch (err) {
      // 直接用后端的中文 message，不在前端二次映射错误码
      setError(err instanceof ApiError ? err.message : '出了点问题，请稍后再试')
    } finally {
      setSubmitting(false)
    }
  }

  // 已登录就不该看到登录页。
  // 这里是登录成功后【唯一】离开 /login 的出口：signIn() 只负责把 me 设上，
  // 路由表里 /login 是无条件渲染 LoginPage 的，没有这段跳转，登录成功后
  // 会一直停在登录页（接口全是 200，看起来像没反应）。
  // 同时也覆盖「已登录的人手动访问 /login」。
  if (me) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from
    return <Navigate to={from?.pathname ?? AFTER_LOGIN} replace />
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <form className="card" onSubmit={onSubmit} style={{ width: 360 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>烛生 · 管理后台</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>
          请用管理员账号登录。
        </p>

        <label htmlFor="username">用户名</label>
        <input id="username" className="input" value={username} autoComplete="username"
               onChange={(e) => setUsername(e.target.value)} />

        <label htmlFor="password" style={{ display: 'block', marginTop: 12 }}>密码</label>
        <input id="password" className="input" type="password" value={password}
               autoComplete="current-password"
               onChange={(e) => setPassword(e.target.value)} />

        {error && (
          <p role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</p>
        )}

        <button type="submit" className="btn primary" disabled={submitting}
                style={{ width: '100%', marginTop: 20 }}>
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
