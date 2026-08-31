import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, clearToken, getToken, request, setToken } from '../client'

describe('API 客户端', () => {
  beforeEach(() => {
    clearToken()
    vi.restoreAllMocks()
  })
  afterEach(() => clearToken())

  const ok = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  it('把 token 放进 Authorization 头', async () => {
    setToken('tok-123')
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ ok: true }))
    await request('/api/v1/admin/me')
    const init = spy.mock.calls[0]![1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-123')
  })

  it('没有 token 时不发 Authorization 头', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ ok: true }))
    await request('/api/v1/config')
    const init = spy.mock.calls[0]![1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
  })

  it('把错误信封抛成带 code 与 message 的 ApiError', async () => {
    // 必须每次返回新的 Response：Response 的 body 只能读一次，
    // mockResolvedValue 复用同一个对象会让第二次调用读到已消费的 body。
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        ok({ code: 'ART_IN_USE', message: '这幅作品已被收藏，只能下架或撤回，不能删除' }, 409),
      ),
    )
    await expect(request('/api/v1/admin/art/x')).rejects.toThrow(ApiError)
    try {
      await request('/api/v1/admin/art/x')
    } catch (e) {
      const err = e as ApiError
      expect(err.status).toBe(409)
      expect(err.code).toBe('ART_IN_USE')
      // 直接用后端的 message——后端已在 Task 7 补全，前端不再维护第二张映射表
      expect(err.message).toContain('已被收藏')
    }
  })

  it('后端没给 message 时用兜底文案，不显示错误码', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ code: 'WEIRD_CODE' }, 500))
    try {
      await request('/x')
    } catch (e) {
      expect((e as ApiError).message).toBe('出了点问题，请稍后再试')
      expect((e as ApiError).message).not.toContain('WEIRD_CODE')
    }
  })

  it('响应不是 JSON 时也抛可读的 ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    )
    await expect(request('/x')).rejects.toThrow(ApiError)
  })

  it('网络中断时抛 ApiError 而不是原始 TypeError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    try {
      await request('/x')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).code).toBe('NETWORK_ERROR')
    }
  })

  it('401 时清掉 token', async () => {
    setToken('stale')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ code: 'TOKEN_INVALID' }, 401))
    await expect(request('/api/v1/admin/me')).rejects.toThrow(ApiError)
    expect(getToken()).toBeNull()
  })

  it('204 无响应体时返回 undefined 而不是解析失败', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await expect(request('/api/v1/admin/art/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('token 存在 sessionStorage 而不是 localStorage', () => {
    setToken('tok-abc')
    expect(sessionStorage.getItem('zhusheng.admin.token')).toBe('tok-abc')
    expect(localStorage.getItem('zhusheng.admin.token')).toBeNull()
  })
})
