import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../../api/endpoints'
import { ToastHost } from '../../../components/Toast'
import RitualPage from '../RitualPage'
import { cloneFixture } from './fixture'

describe('仪式设置页', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(endpoints, 'fetchConfig').mockResolvedValue({
      config: cloneFixture(), updated_by: null, updated_at: null,
    })
  })

  it('阻力选项一行一项地展示', async () => {
    render(<ToastHost><RitualPage /></ToastHost>)
    const box = await screen.findByLabelText('晚间阻力选项')
    expect(box).toHaveValue('我还在刷手机')
  })

  it('编辑阻力选项时按换行拆成数组提交', async () => {
    const preview = vi.spyOn(endpoints, 'previewConfig')
      .mockResolvedValue({ changes: [], valid: true, errors: [] })
    render(<ToastHost><RitualPage /></ToastHost>)
    const box = await screen.findByLabelText('晚间阻力选项')
    await userEvent.clear(box)
    await userEvent.type(box, '我还在刷手机{enter}我还在工作')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    const sent = preview.mock.calls[0]![0]
    expect(sent.ritual.resistance_options).toEqual(['我还在刷手机', '我还在工作'])
  })

  it('数字字段提交为数字而不是字符串', async () => {
    const preview = vi.spyOn(endpoints, 'previewConfig')
      .mockResolvedValue({ changes: [], valid: true, errors: [] })
    render(<ToastHost><RitualPage /></ToastHost>)
    const box = await screen.findByLabelText('感恩输入数量')
    await userEvent.clear(box)
    await userEvent.type(box, '4')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(preview.mock.calls[0]![0].ritual.gratitude_count).toBe(4)
  })

  it('把正文加密渲染成只读说明，不是可关的开关', async () => {
    render(<ToastHost><RitualPage /></ToastHost>)
    expect(await screen.findByText(/书写内容仅保存在用户端与加密列中/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/书写内容仅保存/)).toBeNull()   // 不是表单控件
  })

  it('渲染四个阶段开关', async () => {
    render(<ToastHost><RitualPage /></ToastHost>)
    for (const label of ['阶段一 · 未开始', '阶段二 · 准备入睡',
                         '阶段三 · 即将入睡', '阶段四 · 已完成']) {
      expect(await screen.findByLabelText(label)).toBeInTheDocument()
    }
  })
})
