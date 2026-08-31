export default function Pagination({
  page, pages, total, pageSize, onGo,
}: {
  page: number
  pages: number
  total: number
  pageSize: number
  onGo: (p: number) => void
}) {
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  // 只渲染当前页附近的页码。作品库长到几百幅时，把 20 个页码平铺出来
  // 反而比不分页更难用。
  const window: number[] = []
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) {
    window.push(p)
  }

  return (
    <nav
      aria-label="分页"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        marginTop: 4, paddingTop: 14, borderTop: '1px solid var(--border)',
      }}
    >
      <span style={{ color: 'var(--muted)', fontSize: 13, marginRight: 'auto' }}>
        第 {from}–{to} 项，共 {total} 幅
      </span>

      <button type="button" className="btn" disabled={page <= 1}
              onClick={() => onGo(page - 1)}>
        上一页
      </button>

      {window[0] !== undefined && window[0] > 1 && (
        <>
          <button type="button" className="btn" onClick={() => onGo(1)}>1</button>
          {window[0] > 2 && <span style={{ color: 'var(--muted)' }}>…</span>}
        </>
      )}

      {window.map((p) => (
        <button
          key={p}
          type="button"
          className={p === page ? 'btn primary' : 'btn'}
          aria-current={p === page ? 'page' : undefined}
          onClick={() => onGo(p)}
          style={{ minWidth: 40 }}
        >
          {p}
        </button>
      ))}

      {window[window.length - 1] !== undefined && window[window.length - 1]! < pages && (
        <>
          {window[window.length - 1]! < pages - 1 && (
            <span style={{ color: 'var(--muted)' }}>…</span>
          )}
          <button type="button" className="btn" onClick={() => onGo(pages)}>
            {pages}
          </button>
        </>
      )}

      <button type="button" className="btn" disabled={page >= pages}
              onClick={() => onGo(page + 1)}>
        下一页
      </button>
    </nav>
  )
}
