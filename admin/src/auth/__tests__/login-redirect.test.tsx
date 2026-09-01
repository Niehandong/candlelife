import { CODE_ADMIN_LOGIN_FAILED } from '../../api/codes'
/**
 * 登录成功后必须离开登录页。
 *
 * 这是一个真实 bug 的回归测试：LoginPage 原来只调用 signIn()，成功后什么都不做。
 * me 被设上了，但 URL 还停在 /login，而路由表里 /login 无条件渲染 LoginPage，
 * 于是用户登录成功后仍然看着登录页 —— 网络面板里 login 与 /me 都是 200。
 *
 * 原来那组 LoginPage 测试只断言「login 接口被调用了」，没断言「跳走了」，
 * 所以放过了它。
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToken } from '../../api/client'
import * as endpoints from '../../api/endpoints'
import LoginPage from '../LoginPage'
import RequireAuth from '../RequireAuth'
import { AuthProvider } from '../useAuth'

/** 一个最小的路由表，形状与 App.tsx 一致 */
const renderApp = (initial = '/login') =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/config"
            element={<RequireAuth><div>基础设置页</div></RequireAuth>}
          />
          <Route
            path="/art"
            element={<RequireAuth><div>作品库页</div></RequireAuth>}
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )

const mockLoginOk = () => {
  vi.spyOn(endpoints, 'login').mockResolvedValue({
    access_token: 't', token_type: 'bearer', expires_in: 28800,
  })
  vi.spyOn(endpoints, 'fetchMe').mockResolvedValue({
    username: 'alice', last_login_at: null,
  })
}

const submit = async () => {
  await userEvent.type(await screen.findByLabelText('用户名'), 'alice')
  await userEvent.type(screen.getByLabelText('密码'), 'secret-password')
  await userEvent.click(screen.getByRole('button', { name: '登录' }))
}

describe('登录后的跳转', () => {
  beforeEach(() => {
    clearToken()
    vi.restoreAllMocks()
  })

  it('登录成功后离开登录页，进入配置页', async () => {
    mockLoginOk()
    renderApp()
    await submit()
    expect(await screen.findByText('基础设置页')).toBeInTheDocument()
    expect(screen.queryByLabelText('密码')).toBeNull()
  })

  it('已登录的人手动访问 /login 会被送回配置页', async () => {
    vi.spyOn(endpoints, 'fetchMe').mockResolvedValue({
      username: 'alice', last_login_at: null,
    })
    const { setToken } = await import('../../api/client')
    setToken('existing-token')
    renderApp('/login')
    expect(await screen.findByText('基础设置页')).toBeInTheDocument()
  })

  it('被守卫拦下时记住原来要去的页面，登录后回到那里', async () => {
    mockLoginOk()
    renderApp('/art')                       // 未登录访问 /art → 应被送到 /login
    await submit()
    expect(await screen.findByText('作品库页')).toBeInTheDocument()
  })

  it('登录失败时留在登录页', async () => {
    const { ApiError } = await import('../../api/client')
    vi.spyOn(endpoints, 'login')
      .mockRejectedValue(new ApiError(CODE_ADMIN_LOGIN_FAILED, '用户名或密码不正确'))
    renderApp()
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码不正确')
    expect(screen.getByLabelText('密码')).toBeInTheDocument()
  })
})
