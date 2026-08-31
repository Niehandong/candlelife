import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ArtForm from '../ArtForm'

const filled = {
  id: 'starry-night', title: '星夜', artist: '文森特·梵高', year: '1889',
  thumbnail: 'art/sn-thumb.jpg', image: 'art/sn.jpg', alt: '旋转的夜空',
  source: 'Public domain', article: '梵高在圣雷米的疗养院里画下这幅画。',
}

describe('作品表单', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  })

  it('新增时 slug 可编辑', () => {
    render(<ArtForm onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('标识（slug）')).not.toHaveAttribute('readonly')
  })

  it('编辑时 slug 只读——它是收藏与抽卡的稳定标识', () => {
    render(<ArtForm initial={filled} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('标识（slug）')).toHaveAttribute('readonly')
  })

  it('编辑时回填全部字段', () => {
    render(<ArtForm initial={filled} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('标题')).toHaveValue('星夜')
    expect(screen.getByLabelText('艺术家')).toHaveValue('文森特·梵高')
    expect(screen.getByLabelText('文章')).toHaveValue(
      '梵高在圣雷米的疗养院里画下这幅画。')
  })

  it('slug 格式不合法时本地就报错，不用等后端', async () => {
    const onSubmit = vi.fn()
    render(<ArtForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('标识（slug）'), 'Not A Slug!')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText(/只能用小写字母、数字与连字符/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('必填字段为空时报错', async () => {
    const onSubmit = vi.fn()
    render(<ArtForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('标识（slug）'), 'ok-slug')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findAllByText('不得为空')).length).toBeGreaterThan(0)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('全部填好后提交完整载荷', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ArtForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    for (const [label, value] of [
      ['标识（slug）', filled.id], ['标题', filled.title], ['艺术家', filled.artist],
      ['年份', filled.year], ['缩略图路径', filled.thumbnail],
      ['大图路径', filled.image], ['图片描述（alt）', filled.alt],
      ['来源', filled.source], ['文章', filled.article],
    ] as const) {
      await userEvent.type(screen.getByLabelText(label), value)
    }
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(filled))
  })

  it('图片路径探测 404 时黄色警告但不阻止保存', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ArtForm initial={filled} onSubmit={onSubmit} onCancel={vi.fn()} />)
    expect(await screen.findByText(/这个路径现在取不到文件/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  })

  it('探测本身失败时静默——不能因为探测挂了就挡住保存', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ArtForm initial={filled} onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  })
})
