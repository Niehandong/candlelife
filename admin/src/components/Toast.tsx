import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

const ToastContext = createContext<(msg: string) => void>(() => {})

export function ToastHost({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)

  const show = useCallback((msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), 2600)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--ink)', color: '#fff', padding: '10px 20px',
            borderRadius: 999, zIndex: 100,
          }}
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
