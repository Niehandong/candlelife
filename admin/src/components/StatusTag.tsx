import type { ArtStatus } from '../api/types'

const STYLES: Record<ArtStatus, { label: string; color: string; bg: string }> = {
  active: { label: '上架中', color: 'var(--success)', bg: 'var(--success-bg)' },
  inactive: { label: '已下架', color: 'var(--warn)', bg: 'var(--warn-bg)' },
  withdrawn: { label: '已撤回', color: 'var(--danger)', bg: 'var(--soft)' },
}

export default function StatusTag({ status }: { status: ArtStatus }) {
  const s = STYLES[status]
  return (
    <span style={{
      color: s.color, background: s.bg, borderRadius: 999,
      padding: '2px 10px', fontSize: 12, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}
