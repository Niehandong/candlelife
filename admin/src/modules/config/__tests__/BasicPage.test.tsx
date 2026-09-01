import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CODE_NETWORK } from '../../../api/codes'

import { ApiError } from '../../../api/client'
import * as endpoints from '../../../api/endpoints'
import { ToastHost } from '../../../components/Toast'
import BasicPage from '../BasicPage'
import { cloneFixture } from './fixture'

const renderPage = () => render(<ToastHost><BasicPage /></ToastHost>)

describe('基础设置页', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(endpoints, 'fetchConfig').mockResolvedValue({
      config: cloneFixture(), updated_by: 'alice', updated_at: '2026-08-31T10:00:00Z',
    })
  })

  it('把当前值填进输入框', async () => {
    renderPage()
    expect(await screen.findByLabelText('小程序名称')).toHaveValue('烛生')
    expect(screen.getByLabelText('一句话定位')).toHaveValue('陪你按时睡觉')
    expect(screen.getByLabelText('默认就寝时间')).toHaveValue('23:30')
  })

  it('显示最后修改人', async () => {
    renderPage()
    expect(await screen.findByText(/alice/)).toBeInTheDocument()
  })

  it('未改动时保存按钮不可点', async () => {
    renderPage()
    await screen.findByLabelText('小程序名称')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('改动后先走 dry_run，再弹确认窗展示 diff', async () => {
    const preview = vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [{ path: 'app.slogan', from: '陪你按时睡觉', to: '陪你好好睡' }],
      valid: true, errors: [],
    })
    renderPage()
    const slogan = await screen.findByLabelText('一句话定位')
    await userEvent.clear(slogan)
    await userEvent.type(slogan, '陪你好好睡')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(preview).toHaveBeenCalled())
    const dialog = await screen.findByRole('dialog')
    // 限定在弹窗内查：「一句话定位」同时是表单标签和 diff 表的行名
    expect(within(dialog).getByText('一句话定位')).toBeInTheDocument()
    expect(within(dialog).getByText('陪你按时睡觉')).toBeInTheDocument()
    expect(within(dialog).getByText('陪你好好睡')).toBeInTheDocument()
  })

  it('确认后才真正保存', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [{ path: 'app.slogan', from: 'a', to: 'b' }], valid: true, errors: [],
    })
    const save = vi.spyOn(endpoints, 'saveConfig').mockResolvedValue({
      config: cloneFixture(), updated_by: 'alice', updated_at: '2026-08-31T11:00:00Z',
    })
    renderPage()
    await userEvent.type(await screen.findByLabelText('一句话定位'), 'x')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('dialog')
    expect(save).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '确认保存' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(await screen.findByRole('status')).toHaveTextContent('已保存')
  })

  it('取消确认窗则不保存', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [{ path: 'app.slogan', from: 'a', to: 'b' }], valid: true, errors: [],
    })
    const save = vi.spyOn(endpoints, 'saveConfig')
    renderPage()
    await userEvent.type(await screen.findByLabelText('一句话定位'), 'x')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(save).not.toHaveBeenCalled()
  })

  it('校验不过时在字段旁标红，不弹确认窗', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [], valid: false,
      errors: [{ field: 'app.name', message: '不得为空' }],
    })
    renderPage()
    const name = await screen.findByLabelText('小程序名称')
    await userEvent.clear(name)
    await userEvent.type(name, 'x')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('不得为空')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(name).toHaveAttribute('aria-invalid', 'true')
  })

  it('撤销改动退回原值', async () => {
    renderPage()
    const slogan = await screen.findByLabelText('一句话定位')
    await userEvent.clear(slogan)
    await userEvent.type(slogan, '改坏了')
    await userEvent.click(screen.getByRole('button', { name: '撤销改动' }))
    expect(slogan).toHaveValue('陪你按时睡觉')
  })

  it('加载失败时显示错误与重试按钮', async () => {
    vi.spyOn(endpoints, 'fetchConfig')
      .mockRejectedValue(new ApiError(CODE_NETWORK, '网络连接失败，请检查后端是否在运行'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('网络连接失败')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
