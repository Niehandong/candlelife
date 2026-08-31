import { useEffect } from 'react'
import type { ReactNode } from 'react'

export default function ConfirmDialog({
  open, title, body, confirmLabel, danger, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(23,20,29,.45)',
        display: 'grid', placeItems: 'center', zIndex: 80,
      }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card"
        style={{ width: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{title}</h2>
        <div style={{ color: 'var(--muted)', marginBottom: 20 }}>{body}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel}>取消</button>
          <button type="button" className={danger ? 'btn danger' : 'btn primary'}
                  onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
