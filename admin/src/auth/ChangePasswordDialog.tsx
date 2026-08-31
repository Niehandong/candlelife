import { useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../api/client'
import { changePassword } from '../api/endpoints'

/** 密码长度下限。当前 1 = 不限制（用户要求暂时取消 12 位下限）。
 *
 *  后端的对应常量在 backend/app/core/password.py 的 MIN_PASSWORD_LEN，
 *  两边刻意不共享代码，恢复限制时两处都要改。 */
const MIN_LEN = 1

/** bcrypt 的上限是 72【字节】，中文一字 3 字节。前端先算清楚，别等后端报错。 */
const byteLength = (s: string) => new TextEncoder().encode(s).length
const MAX_BYTES = 72

export default function ChangePasswordDialog({
  open, onClose, onChanged,
}: {
  open: boolean
  onClose: () => void
  /** 改成功后调用。当前 token 已失效，调用方负责登出并跳登录页。 */
  onChanged: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm(''); setError(null)
  }

  const close = () => { reset(); onClose() }

  /** 本地能判的先判掉，省一次往返；后端有同样的校验，不依赖这里 */
  function localError(): string | null {
    if (!current) return '请输入当前密码'
    if (!next) return '请输入新密码'
    if (next.length < MIN_LEN) return `新密码至少 ${MIN_LEN} 位`
    if (byteLength(next) > MAX_BYTES) {
      return `新密码过长（上限 ${MAX_BYTES} 字节，中文一字算 3 字节，当前 ${byteLength(next)}）`
    }
    if (next === current) return '新密码与当前密码相同'
    if (next !== confirm) return '两次输入的新密码不一致'
    return null
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const local = localError()
    if (local) { setError(local); return }

    setSubmitting(true)
    setError(null)
    try {
      await changePassword(current, next)
      reset()
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '出了点问题，请稍后再试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(23,20,29,.45)',
        display: 'grid', placeItems: 'center', zIndex: 80,
      }}
      onClick={close}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="修改密码"
        className="card"
        style={{ width: 420 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>修改密码</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 18px' }}>
          改完会<strong>退出所有已登录的设备</strong>（包括当前这台），需要用新密码重新登录。
        </p>

        <label htmlFor="pw-current">当前密码</label>
        <input id="pw-current" className="input" type="password" value={current}
               autoComplete="current-password"
               onChange={(e) => { setCurrent(e.target.value); setError(null) }} />

        <label htmlFor="pw-new" style={{ display: 'block', marginTop: 12 }}>新密码</label>
        <input id="pw-new" className="input" type="password" value={next}
               autoComplete="new-password"
               onChange={(e) => { setNext(e.target.value); setError(null) }} />
        <p className="field-hint">
          {MIN_LEN > 1 && `至少 ${MIN_LEN} 位。`}
          上限 {MAX_BYTES} 字节，中文一字算 3 字节。
        </p>

        <label htmlFor="pw-confirm" style={{ display: 'block', marginTop: 12 }}>
          再输一次新密码
        </label>
        <input id="pw-confirm" className="input" type="password" value={confirm}
               autoComplete="new-password"
               onChange={(e) => { setConfirm(e.target.value); setError(null) }} />

        {error && (
          <p role="alert" className="field-error" style={{ marginTop: 14 }}>{error}</p>
        )}

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)',
        }}>
          <button type="button" className="btn" onClick={close} disabled={submitting}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? '提交中…' : '确认修改'}
          </button>
        </div>
      </form>
    </div>
  )
}
