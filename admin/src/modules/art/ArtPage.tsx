import { useState } from 'react'

import { ApiError } from '../../api/client'
import { createArt, deleteArt, updateArt } from '../../api/endpoints'
import ConfirmDialog from '../../components/ConfirmDialog'
import Pagination from '../../components/Pagination'
import StatusTag from '../../components/StatusTag'
import { useToast } from '../../components/Toast'
import type { ArtCreate, ArtItem, ArtStatus } from '../../api/types'
import ArtForm from './ArtForm'
import { PAGE_SIZE, useArtList } from './useArtList'

type Pending =
  | { kind: 'withdraw'; art: ArtItem }
  | { kind: 'delete'; art: ArtItem }
  | null

/** 三种状态在用户那边的实际后果。写在界面上，而不是只写在确认弹窗里。 */
const STATE_HELP = [
  { tag: '上架中', body: '进抽卡池，可以被抽到。已收藏的用户能看到。' },
  { tag: '已下架', body: '不再被抽到，但已收藏的用户仍然能看到自己那幅。' },
  {
    tag: '已撤回',
    body: '不再被抽到，且已收藏的用户也看不到了。用于版权等法务原因 —— ' +
      '被收藏过的作品在数据库层删不掉，撤回就是这种情况下的「删除」。',
  },
] as const

export default function ArtPage() {
  const list = useArtList()
  const toast = useToast()
  const [editing, setEditing] = useState<ArtItem | 'new' | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  async function run(action: () => Promise<unknown>, okMessage: string) {
    setBusy(true)
    try {
      await action()
      toast(okMessage)
      await list.reload()
      setEditing(null)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  if (editing !== null) {
    const initial: ArtCreate | undefined = editing === 'new' ? undefined : {
      id: editing.id, title: editing.title, artist: editing.artist, year: editing.year,
      thumbnail: editing.thumbnail, image: editing.image, alt: editing.alt,
      source: editing.source, article: editing.article,
    }
    const target = editing
    return (
      <ArtForm
        initial={initial}
        submitting={busy}
        onCancel={() => setEditing(null)}
        onSubmit={(payload: ArtCreate) =>
          target === 'new'
            ? run(() => createArt(payload), '已新增')
            : run(() => {
                const { id: _id, ...rest } = payload
                return updateArt(target.id, rest)
              }, '已保存')
        }
      />
    )
  }

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>作品库</h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            共 {list.total} 幅。
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              aria-expanded={showHelp}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: 'var(--primary-deep)', textDecoration: 'underline',
                textUnderlineOffset: 2, font: 'inherit',
              }}
            >
              上架 / 下架 / 撤回 有什么区别？
            </button>
          </p>
        </div>
        <button type="button" className="btn primary" style={{ marginLeft: 'auto' }}
                onClick={() => setEditing('new')}>
          新增作品
        </button>
      </header>

      {showHelp && (
        <div className="card" style={{ marginBottom: 16, background: 'var(--surface-2)' }}>
          {STATE_HELP.map((s) => (
            <div key={s.tag} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <span style={{ flex: '0 0 72px' }}>
                <StatusTag
                  status={
                    s.tag === '上架中' ? 'active' : s.tag === '已下架' ? 'inactive' : 'withdrawn'
                  }
                />
              </span>
              <span style={{ color: 'var(--ink)', fontSize: 14 }}>{s.body}</span>
            </div>
          ))}
          <div style={{
            display: 'flex', gap: 12, paddingTop: 10,
            borderTop: '1px solid var(--border)',
          }}>
            <span style={{ flex: '0 0 72px', color: 'var(--danger)', fontSize: 12 }}>删除</span>
            <span style={{ color: 'var(--ink)', fontSize: 14 }}>
              物理删除这条记录，无法恢复。<strong>只有从没被任何用户收藏过的作品能删</strong> ——
              被收藏过的删除按钮是灰的，那种情况用「撤回」。
            </span>
          </div>
        </div>
      )}

      <div className="card" style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ width: 200 }}>
          <label htmlFor="art-status">筛选状态</label>
          <select id="art-status" className="select" value={list.status}
                  onChange={(e) => list.setStatus(e.target.value as ArtStatus | '')}>
            <option value="">全部</option>
            <option value="active">上架中</option>
            <option value="inactive">已下架</option>
            <option value="withdrawn">已撤回</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="art-q">搜索</label>
          <input id="art-q" className="input" value={list.q} placeholder="标题、艺术家或标识"
                 onChange={(e) => list.setQ(e.target.value)} />
        </div>
      </div>

      {list.loading && <div className="card">载入中…</div>}

      {!list.loading && list.error && (
        <div className="card">
          <p role="alert" className="field-error">{list.error}</p>
          <button type="button" className="btn" onClick={() => void list.reload()}>
            重试
          </button>
        </div>
      )}

      {!list.loading && !list.error && list.items.length === 0 && (
        <div className="card" style={{ color: 'var(--muted)' }}>没有符合条件的作品</div>
      )}

      {!list.loading && !list.error && list.items.map((art) => (
        <div key={art.id} className="card"
             style={{ display: 'flex', gap: 18, marginBottom: 12, alignItems: 'flex-start' }}>
          <img src={art.thumbnail_url} alt={art.alt}
               style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12,
                        background: 'var(--soft)' }} />

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong>{art.title}</strong>
              <StatusTag status={art.status} />
            </div>
            <div style={{ color: 'var(--muted)' }}>
              {art.artist} · {art.year}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
              {art.id}
              {art.reward_count > 0 && ` · 被收藏 ${art.reward_count} 次`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 110 }}>
            <button type="button" className="btn" disabled={busy}
                    onClick={() => setEditing(art)}>
              编辑
            </button>

            {!art.is_withdrawn && (
              <button type="button" className="btn" disabled={busy}
                      title={art.is_active
                        ? '不再被抽到，但已收藏的用户仍能看到'
                        : '重新进入抽卡池'}
                      onClick={() => void run(
                        () => updateArt(art.id, { is_active: !art.is_active }),
                        art.is_active ? '已下架' : '已上架')}>
                {art.is_active ? '下架' : '上架'}
              </button>
            )}

            {!art.is_withdrawn ? (
              <button type="button" className="btn danger" disabled={busy}
                      title="连已收藏的用户也看不到 —— 用于版权等法务原因"
                      onClick={() => setPending({ kind: 'withdraw', art })}>
                撤回
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy}
                      title="恢复到上架中"
                      onClick={() => void run(
                        () => updateArt(art.id, { is_withdrawn: false }), '已恢复')}>
                取消撤回
              </button>
            )}

            <button
              type="button"
              className="btn danger"
              disabled={busy || art.reward_count > 0}
              title={art.reward_count > 0
                ? `这幅作品已被收藏 ${art.reward_count} 次，只能下架或撤回，不能删除`
                : '物理删除，无法恢复'}
              onClick={() => setPending({ kind: 'delete', art })}
            >
              删除
            </button>
          </div>
        </div>
      ))}

      {!list.loading && !list.error && (
        <Pagination
          page={list.page}
          pages={list.pages}
          total={list.total}
          pageSize={PAGE_SIZE}
          onGo={list.goTo}
        />
      )}

      <ConfirmDialog
        open={pending?.kind === 'withdraw'}
        title="确认撤回"
        body={
          <>
            撤回《{pending?.art.title}》后，<strong>已收藏这幅作品的用户也将看不到它</strong>，
            它同时退出抽卡池。
            <br />
            如果只是想让它不再被抽到，请用「下架」——下架后已收藏的用户仍能看到。
          </>
        }
        confirmLabel="确认撤回"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const art = pending?.art
          if (art) void run(() => updateArt(art.id, { is_withdrawn: true }), '已撤回')
        }}
      />

      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title="确认删除"
        body={
          <>
            《{pending?.art.title}》将被<strong>永久删除</strong>，无法恢复。
            <br />
            如果只是想让它不再出现，用「下架」或「撤回」。
          </>
        }
        confirmLabel="确认删除"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const art = pending?.art
          if (art) void run(() => deleteArt(art.id), '已删除')
        }}
      />
    </>
  )
}
