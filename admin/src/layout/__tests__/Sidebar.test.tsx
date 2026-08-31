import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import Sidebar from '../Sidebar'

const renderAt = (path: string, signOut = vi.fn()) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar username="alice" onSignOut={signOut} />
    </MemoryRouter>,
  )

describe('侧边导航', () => {
  it('渲染五个模块', () => {
    renderAt('/config')
    for (const name of ['基础设置', '开场引导', '仪式设置', '记录与奖励', '作品库']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('当前路由的那一项被标记为 current', () => {
    renderAt('/art')
    expect(screen.getByRole('link', { name: '作品库' }))
      .toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '基础设置' }))
      .not.toHaveAttribute('aria-current')
  })

  it('显示当前登录的管理员', () => {
    renderAt('/config')
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('点登出触发回调', async () => {
    const signOut = vi.fn()
    renderAt('/config', signOut)
    await userEvent.click(screen.getByRole('button', { name: '登出' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('导航只有这五条已知安全的路由，没有通往用户数据的入口', () => {
    // 用精确白名单而不是关键词正则：正则会把 /records（「记录与奖励」配置页）
    // 误判为用户数据。加第六个导航项时这条会红，那正是需要人判断
    // 「这一项会不会暴露用户数据」的时刻。
    renderAt('/config')
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs.sort()).toEqual(
      ['/art', '/config', '/onboarding', '/records', '/ritual'])
  })
})
