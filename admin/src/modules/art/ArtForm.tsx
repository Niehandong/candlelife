import { useEffect, useState } from 'react'

import Field from '../../components/Field'
import type { ArtCreate } from '../../api/types'

const SLUG = /^[a-z0-9][a-z0-9-]*$/

const EMPTY: ArtCreate = {
  id: '', title: '', artist: '', year: '',
  thumbnail: '', image: '', alt: '', source: '', article: '',
}

const REQUIRED: (keyof ArtCreate)[] = [
  'id', 'title', 'artist', 'year', 'thumbnail', 'image', 'alt', 'source', 'article',
]

/** HEAD 探测图片是否已经上传。取不到只警告，不阻止保存——文件可能稍后才放上去。 */
async function probe(path: string): Promise<boolean | null> {
  if (!path.trim()) return null
  try {
    const res = await fetch(`/static/${path.replace(/^\/+/, '')}`, { method: 'HEAD' })
    return res.ok
  } catch {
    return null           // 探测本身失败，什么都不说
  }
}

export default function ArtForm({
  initial, onSubmit, onCancel, submitting,
}: {
  initial?: ArtCreate
  onSubmit: (payload: ArtCreate) => Promise<void> | void
  onCancel: () => void
  submitting?: boolean
}) {
  const isEdit = initial !== undefined
  const [form, setForm] = useState<ArtCreate>(initial ?? EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof ArtCreate, string>>>({})
  const [missingFiles, setMissingFiles] = useState<string[]>([])

  const set = <K extends keyof ArtCreate>(key: K, value: ArtCreate[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      probe(form.thumbnail).then((ok): string | null => (ok === false ? '缩略图' : null)),
      probe(form.image).then((ok): string | null => (ok === false ? '大图' : null)),
    ]).then((results) => {
      if (!cancelled) setMissingFiles(results.filter((r): r is string => r !== null))
    })
    return () => { cancelled = true }
  }, [form.thumbnail, form.image])

  function validate(): boolean {
    const next: Partial<Record<keyof ArtCreate, string>> = {}
    for (const key of REQUIRED) {
      if (!form[key].trim()) next[key] = '不得为空'
    }
    if (form.id.trim() && !SLUG.test(form.id.trim())) {
      next.id = '只能用小写字母、数字与连字符，且以字母或数字开头'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        if (!validate()) return
        const trimmed = { ...form }
        for (const key of REQUIRED) trimmed[key] = form[key].trim()
        void onSubmit(trimmed)
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0 }}>{isEdit ? '编辑作品' : '新增作品'}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
        <Field label="标识（slug）" htmlFor="art-id" error={errors.id}
               hint={isEdit ? '标识不可修改——它是收藏与抽卡的稳定引用'
                            : '小写字母、数字与连字符，如 water-lilies'}>
          <input id="art-id" className="input" value={form.id} readOnly={isEdit}
                 aria-invalid={Boolean(errors.id)}
                 onChange={(e) => set('id', e.target.value)} />
        </Field>

        <Field label="标题" htmlFor="art-title" error={errors.title}>
          <input id="art-title" className="input" value={form.title}
                 aria-invalid={Boolean(errors.title)}
                 onChange={(e) => set('title', e.target.value)} />
        </Field>

        <Field label="艺术家" htmlFor="art-artist" error={errors.artist}>
          <input id="art-artist" className="input" value={form.artist}
                 onChange={(e) => set('artist', e.target.value)} />
        </Field>

        <Field label="年份" htmlFor="art-year" error={errors.year}>
          <input id="art-year" className="input" value={form.year}
                 onChange={(e) => set('year', e.target.value)} />
        </Field>

        <Field label="缩略图路径" htmlFor="art-thumb" error={errors.thumbnail}
               hint="相对 ASSET_BASE_URL，如 art/water-lilies-thumb.jpg">
          <input id="art-thumb" className="input" value={form.thumbnail}
                 onChange={(e) => set('thumbnail', e.target.value)} />
        </Field>

        <Field label="大图路径" htmlFor="art-image" error={errors.image}>
          <input id="art-image" className="input" value={form.image}
                 onChange={(e) => set('image', e.target.value)} />
        </Field>

        <Field label="图片描述（alt）" htmlFor="art-alt" full error={errors.alt}
               hint="给读屏软件用的一句描述">
          <input id="art-alt" className="input" value={form.alt}
                 onChange={(e) => set('alt', e.target.value)} />
        </Field>

        <Field label="来源" htmlFor="art-source" full error={errors.source}
               hint="公共领域的出处说明，如 Public domain, via Wikimedia Commons">
          <input id="art-source" className="input" value={form.source}
                 onChange={(e) => set('source', e.target.value)} />
        </Field>

        <Field label="文章" htmlFor="art-article" full error={errors.article}>
          <textarea id="art-article" className="textarea" rows={6} value={form.article}
                    aria-invalid={Boolean(errors.article)}
                    onChange={(e) => set('article', e.target.value)} />
        </Field>
      </div>

      {missingFiles.length > 0 && (
        <p style={{
          background: 'var(--warn-bg)', color: 'var(--warn)',
          padding: '10px 14px', borderRadius: 10,
        }}>
          {missingFiles.join('与')}：这个路径现在取不到文件。
          如果你还没把图片放到 backend/static/ 下，可以先保存，之后再上传。
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? '保存中…' : '保存'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>取消</button>
      </div>
    </form>
  )
}
