import type { ReactNode } from 'react'

export default function Field({
  label, htmlFor, error, hint, children, full,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
  full?: boolean
}) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, marginBottom: 4 }}>
      <label htmlFor={htmlFor} style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && <p className="field-error">{error}</p>}
      {!error && hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
