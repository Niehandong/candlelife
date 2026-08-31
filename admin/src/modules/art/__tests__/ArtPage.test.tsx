import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../api/client'
import * as endpoints from '../../../api/endpoints'
import { ToastHost } from '../../../components/Toast'
import type { ArtItem } from '../../../api/types'
import ArtPage from '../ArtPage'

const item = (over: Partial<ArtItem> = {}): ArtItem => ({
  id: 'water-lilies', title: '睡莲', artist: '克劳德·莫奈', year: '1906',
  thumbnail: 'art/wl-thumb.jpg', image: 'art/wl.jpg', alt: '一池睡莲',
  source: 'Public domain', article: '莫奈画了两百多幅睡莲。',
  is_active: true, is_withdrawn: false, status: 'active',
  thumbnail_url: 'http://localhost:8000/static/art/wl-thumb.jpg',
  image_url: 'http://localhost:8000/static/art/wl.jpg',
  reward_count: 0,
  ...over,
})

/** 后端分页响应的形状。测试里到处要用，抽出来免得漏字段。 */
const listOf = (items: ArtItem[], over: Partial<{
  total: number; page: number; page_size: number; pages: number
}> = {}) => ({
  items,
  total: over.total ?? items.length,
  page: over.page ?? 1,
  page_size: over.page_size ?? 20,
  pages: over.pages ?? (items.length ? 1 : 0),
})

const renderPage = () => render(<ToastHost><ArtPage /></ToastHost>)

describe('作品库', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(listOf([item()]))
    // ArtForm 会 HEAD 探测图片路径
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  })

  it('列出作品的标题、艺术家与状态', async () => {
    renderPage()
    expect(await screen.findByText('睡莲')).toBeInTheDocument()
    expect(screen.getByText(/克劳德·莫奈/)).toBeInTheDocument()
    // 限定 span：「上架中」同时是筛选下拉的 option 和状态标签
    expect(screen.getByText('上架中', { selector: 'span' })).toBeInTheDocument()
  })

  it('显示缩略图并带 alt', async () => {
    renderPage()
    const img = await screen.findByAltText('一池睡莲')
    expect(img).toHaveAttribute('src', 'http://localhost:8000/static/art/wl-thumb.jpg')
  })

  it('按状态筛选时带上 status 参数', async () => {
    const spy = vi.spyOn(endpoints, 'fetchArt')
      .mockResolvedValue(listOf([]))
    renderPage()
    await screen.findByLabelText('筛选状态')
    await userEvent.selectOptions(screen.getByLabelText('筛选状态'), 'withdrawn')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith('withdrawn', '', 1, 20))
  })

  it('搜索时带上 q 参数', async () => {
    const spy = vi.spyOn(endpoints, 'fetchArt')
      .mockResolvedValue(listOf([]))
    renderPage()
    await userEvent.type(await screen.findByLabelText('搜索'), '莫奈')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith('', '莫奈', 1, 20))
  })

  it('点下架调用 PATCH is_active=false', async () => {
    const spy = vi.spyOn(endpoints, 'updateArt').mockResolvedValue(
      item({ is_active: false, status: 'inactive' }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '下架' }))
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('water-lilies', { is_active: false }))
  })

  it('已下架的作品显示「上架」按钮', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(listOf([item({ is_active: false, status: 'inactive' })]))
    const spy = vi.spyOn(endpoints, 'updateArt').mockResolvedValue(item())
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '上架' }))
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('water-lilies', { is_active: true }))
  })

  it('撤回必须二次确认，且说清已收藏用户也看不到', async () => {
    const spy = vi.spyOn(endpoints, 'updateArt').mockResolvedValue(
      item({ is_withdrawn: true, status: 'withdrawn' }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '撤回' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/已收藏这幅作品的用户也将看不到它/)
    expect(spy).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '确认撤回' }))
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('water-lilies', { is_withdrawn: true }))
  })

  it('删除也要二次确认', async () => {
    const spy = vi.spyOn(endpoints, 'deleteArt').mockResolvedValue(undefined)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '删除' }))
    await screen.findByRole('dialog')
    expect(spy).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('water-lilies'))
  })

  it('被收藏过的作品删除按钮禁用并给出原因', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(listOf([item({ reward_count: 7 })]))
    renderPage()
    const btn = await screen.findByRole('button', { name: '删除' })
    expect(btn).toBeDisabled()
    expect(btn.getAttribute('title')).toContain('已被收藏')
    expect(screen.getByText(/被收藏 7 次/)).toBeInTheDocument()
  })

  it('后端返回 409 时把中文原因显示出来', async () => {
    vi.spyOn(endpoints, 'deleteArt').mockRejectedValue(
      new ApiError(409, 'ART_IN_USE', '这幅作品已被收藏，只能下架或撤回，不能删除'))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '删除' }))
    await userEvent.click(await screen.findByRole('button', { name: '确认删除' }))
    expect(await screen.findByRole('status')).toHaveTextContent('只能下架或撤回')
  })

  it('空列表时给出提示而不是空白', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(listOf([]))
    renderPage()
    expect(await screen.findByText('没有符合条件的作品')).toBeInTheDocument()
  })

  it('加载失败时显示错误与重试', async () => {
    vi.spyOn(endpoints, 'fetchArt')
      .mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查后端是否在运行'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('网络连接失败')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('点新增打开表单', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '新增作品' }))
    expect(await screen.findByLabelText('标识（slug）')).toBeInTheDocument()
  })
})

// ── 分页 ────────────────────────────────────────────────────────────
describe('作品库分页', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  })

  const many = (n: number, page = 1, pages = 3, total = 45) =>
    listOf(Array.from({ length: n }, (_, i) => item({ id: `w-${page}-${i}`, title: `作品 ${page}-${i}` })),
           { total, page, pages })

  it('显示总数与当前区间', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(many(20, 1, 3, 45))
    renderPage()
    expect(await screen.findByText(/第 1–20 项，共 45 幅/)).toBeInTheDocument()
  })

  it('第一页时「上一页」不可点', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(many(20, 1, 3, 45))
    renderPage()
    expect(await screen.findByRole('button', { name: '上一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一页' })).not.toBeDisabled()
  })

  it('最后一页时「下一页」不可点', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(many(5, 3, 3, 45))
    renderPage()
    expect(await screen.findByRole('button', { name: '下一页' })).toBeDisabled()
  })

  it('点「下一页」按页码请求下一页', async () => {
    const spy = vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(many(20, 1, 3, 45))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '下一页' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith('', '', 2, 20))
  })

  it('点页码直接跳到那一页', async () => {
    const spy = vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(many(20, 1, 3, 45))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '3' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith('', '', 3, 20))
  })

  it('当前页码被标为 current', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(many(20, 2, 3, 45))
    renderPage()
    expect(await screen.findByRole('button', { name: '2' }))
      .toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current')
  })

  it('只有一页时不显示分页控件', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(listOf([item()], { total: 1, pages: 1 }))
    renderPage()
    await screen.findByText('睡莲')
    expect(screen.queryByRole('navigation', { name: '分页' })).toBeInTheDocument()
    // 一页时上下页都不可点
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })

  it('空结果时完全不渲染分页', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(listOf([]))
    renderPage()
    await screen.findByText('没有符合条件的作品')
    expect(screen.queryByRole('navigation', { name: '分页' })).toBeNull()
  })

  it('改筛选条件时回到第 1 页', async () => {
    const spy = vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(many(20, 3, 3, 45))
    renderPage()
    await screen.findByLabelText('筛选状态')
    await userEvent.selectOptions(screen.getByLabelText('筛选状态'), 'inactive')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith('inactive', '', 1, 20))
  })

  it('搜索时回到第 1 页', async () => {
    const spy = vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(many(20, 3, 3, 45))
    renderPage()
    await userEvent.type(await screen.findByLabelText('搜索'), '莫奈')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith('', '莫奈', 1, 20))
  })
})

// ── 三种状态的说明 ──────────────────────────────────────────────────
describe('上架 / 下架 / 撤回的区别说明', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue(listOf([item()]))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  })

  it('默认收起，点了才展开', async () => {
    renderPage()
    const toggle = await screen.findByRole('button', { name: /有什么区别/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/已收藏的用户仍然能看到自己那幅/)).toBeNull()
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('展开后说清三种状态与删除的差别', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /有什么区别/ }))
    expect(screen.getByText(/进抽卡池，可以被抽到/)).toBeInTheDocument()
    expect(screen.getByText(/已收藏的用户仍然能看到自己那幅/)).toBeInTheDocument()
    expect(screen.getByText(/已收藏的用户也看不到了/)).toBeInTheDocument()
    expect(screen.getByText(/只有从没被任何用户收藏过的作品能删/)).toBeInTheDocument()
  })

  it('按钮上有 title 说明后果，不用展开说明也能看懂', async () => {
    renderPage()
    expect((await screen.findByRole('button', { name: '下架' })).getAttribute('title'))
      .toContain('已收藏的用户仍能看到')
    expect(screen.getByRole('button', { name: '撤回' }).getAttribute('title'))
      .toContain('已收藏的用户也看不到')
  })
})
