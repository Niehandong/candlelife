import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CODE_ADMIN_LOGIN_FAILED, CODE_TOO_MANY_ATTEMPTS } from '../../api/codes'

import { ApiError, clearToken } from '../../api/client'
import * as endpoints from '../../api/endpoints'
import LoginPage from '../LoginPage'
import { AuthProvider } from '../useAuth'

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  )

describe('登录页', () => {
  beforeEach(() => {
    clearToken()
    vi.restoreAllMocks()
  })

  it('渲染用户名与密码输入框', async () => {
    renderPage()
    expect(await screen.findByLabelText('用户名')).toBeInTheDocument()
    expect(screen.getByLabelText('密码')).toBeInTheDocument()
  })

  it('密码框的 type 是 password', async () => {
    renderPage()
    expect(await screen.findByLabelText('密码')).toHaveAttribute('type', 'password')
  })

  it('提交后调用登录接口', async () => {
    const login = vi.spyOn(endpoints, 'login').mockResolvedValue({
      access_token: 't', token_type: 'bearer', expires_in: 28800,
    })
    vi.spyOn(endpoints, 'fetchMe').mockResolvedValue({
      username: 'alice', last_login_at: null,
    })
    renderPage()
    await userEvent.type(await screen.findByLabelText('用户名'), 'alice')
    await userEvent.type(screen.getByLabelText('密码'), 'secret-password')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => expect(login).toHaveBeenCalledWith('alice', 'secret-password'))
  })

  it('登录失败时显示后端返回的中文错误', async () => {
    vi.spyOn(endpoints, 'login').mockRejectedValue(
      new ApiError(CODE_ADMIN_LOGIN_FAILED, '用户名或密码不正确'),
    )
    renderPage()
    await userEvent.type(await screen.findByLabelText('用户名'), 'alice')
    await userEvent.type(screen.getByLabelText('密码'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码不正确')
  })

  it('限流时显示 429 的提示', async () => {
    vi.spyOn(endpoints, 'login').mockRejectedValue(
      new ApiError(CODE_TOO_MANY_ATTEMPTS, '尝试次数过多，请一分钟后再试'),
    )
    renderPage()
    await userEvent.type(await screen.findByLabelText('用户名'), 'alice')
    await userEvent.type(screen.getByLabelText('密码'), 'x')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('一分钟后再试')
  })

  it('提交中禁用按钮，防止重复提交把自己限流掉', async () => {
    let resolve!: (v: unknown) => void
    vi.spyOn(endpoints, 'login').mockReturnValue(
      new Promise((r) => { resolve = r }) as never,
    )
    vi.spyOn(endpoints, 'fetchMe').mockResolvedValue({
      username: 'alice', last_login_at: null,
    })
    renderPage()
    await userEvent.type(await screen.findByLabelText('用户名'), 'alice')
    await userEvent.type(screen.getByLabelText('密码'), 'secret-password')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => expect(screen.getByRole('button')).toBeDisabled())
    expect(screen.getByRole('button')).toHaveTextContent('登录中…')

    resolve({ access_token: 't', token_type: 'bearer', expires_in: 28800 })
  })

  it('用户名为空时不发请求', async () => {
    const login = vi.spyOn(endpoints, 'login')
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '登录' }))
    expect(login).not.toHaveBeenCalled()
  })
})
