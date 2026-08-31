import type { ReactNode } from 'react'

import { getToken } from '../../api/client'
import { exportConfigUrl } from '../../api/endpoints'
import ConfirmDialog from '../../components/ConfirmDialog'
import DiffTable from '../../components/DiffTable'
import { useToast } from '../../components/Toast'
import type { useConfigForm } from './useConfigForm'

type Form = ReturnType<typeof useConfigForm>

/** 导出快照。
 *
 * 不能用 <a href> 直接下载：那个请求需要 Authorization 头，链接带不了。
 * 所以 fetch 拿到内容再造 Blob。
 */
async function downloadSnapshot(): Promise<void> {
  const res = await fetch(exportConfigUrl, {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
  })
  if (!res.ok) throw new Error('导出失败')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zhusheng-config-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ConfigFormShell({
  title, description, form, children,
}: {
  title: string
  description: string
  form: Form
  children: ReactNode
}) {
  const toast = useToast()

  if (form.loading) return <div className="card">载入中…</div>
  if (!form.config) {
    return (
      <div className="card">
        <p role="alert" className="field-error">{form.error ?? '配置读取失败'}</p>
        <button type="button" className="btn" onClick={() => void form.reload()}>重试</button>
      </div>
    )
  }

  return (
    <>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>{title}</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>{description}</p>
        {form.updatedBy && (
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
            最后修改：{form.updatedBy}
            {form.updatedAt && ` · ${new Date(form.updatedAt).toLocaleString('zh-CN')}`}
          </p>
        )}
      </header>

      <form
        className="card"
        onSubmit={(e) => { e.preventDefault(); void form.preview() }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
          {children}
        </div>

        {form.error && (
          <p role="alert" className="field-error" style={{ marginTop: 16 }}>{form.error}</p>
        )}

        <div style={{
          display: 'flex', gap: 10, marginTop: 24, paddingTop: 18,
          borderTop: '1px solid var(--border)',
        }}>
          <button type="submit" className="btn primary" disabled={!form.dirty || form.saving}>
            保存
          </button>
          <button type="button" className="btn" disabled={!form.dirty} onClick={form.reset}>
            撤销改动
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              void downloadSnapshot()
                .then(() => toast('已导出当前配置'))
                .catch(() => toast('导出失败'))
            }}
          >
            导出快照
          </button>
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          配置保存后立即生效，且<strong>不保留历史版本</strong>。
          改动前建议先导出一份快照。
        </p>
      </form>

      <ConfirmDialog
        open={form.diff !== null}
        title="确认这些改动"
        body={<DiffTable changes={form.diff?.changes ?? []} />}
        confirmLabel={form.saving ? '保存中…' : '确认保存'}
        onCancel={form.dismissDiff}
        onConfirm={() => {
          void form.save().then(() => toast('已保存')).catch(() => {})
        }}
      />
    </>
  )
}
