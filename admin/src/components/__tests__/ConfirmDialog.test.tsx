import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ConfirmDialog from '../ConfirmDialog'

const props = {
  open: true,
  title: '确认撤回',
  body: '撤回后，已收藏这幅作品的用户也将看不到它。',
  confirmLabel: '撤回',
  danger: true,
}

describe('确认对话框', () => {
  it('open 为 false 时不渲染', () => {
    render(<ConfirmDialog {...props} open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('渲染标题与说明', () => {
    render(<ConfirmDialog {...props} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('确认撤回')
    expect(screen.getByText(/已收藏这幅作品的用户也将看不到/)).toBeInTheDocument()
  })

  it('确认与取消各自触发回调', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: '撤回' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('按 Esc 取消', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...props} onConfirm={vi.fn()} onCancel={onCancel} />)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
