import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, clearToken, getToken, request, setToken } from '../client'
import { CODE_ART_IN_USE, CODE_NETWORK, CODE_OK, CODE_TOKEN_INVALID } from '../codes'

/** 后端的统一信封 {code, msg, data} */
const envelope = (data: unknown, code = CODE_OK, msg = 'success') =>
  ({ code, msg, data })

describe('API 客户端', () => {
  beforeEach(() => {
    clearToken()
    vi.restoreAllMocks()
  })
  afterEach(() => clearToken())

  /** 造一个原样的 HTTP 响应（body 就是给什么发什么） */
  const raw = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  /** 造一个后端风格的成功响应：载荷包在信封里 */
  const ok = (data: unknown, status = 200) => raw(envelope(data), status)

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

  it('把错误信封拆成带数字 code 与 msg 的 ApiError', async () => {
    // 必须每次返回新的 Response：Response 的 body 只能读一次，
    // mockResolvedValue 复用同一个对象会让第二次调用读到已消费的 body。
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(raw({
        code: CODE_ART_IN_USE,
        msg: '这幅作品已被收藏，只能下架或撤回，不能删除',
        data: null,
      })),                                    // HTTP 状态 200 —— /api 下永远是 200
    )
    await expect(request('/api/v1/admin/art/x')).rejects.toThrow(ApiError)
    try {
      await request('/api/v1/admin/art/x')
    } catch (e) {
      const err = e as ApiError
      expect(err.code).toBe(CODE_ART_IN_USE)    // 成败只看业务码
      // 直接用后端的 msg，前端不再维护第二张码→中文的映射表
      expect(err.message).toContain('已被收藏')
    }
  })

  it('成功时把信封拆开，调用方拿到的是 data 本身', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ username: 'alice' }))
    const me = await request<{ username: string }>('/api/v1/admin/me')
    // 不是 {code, msg, data}，而是 data 里那个对象
    expect(me).toEqual({ username: 'alice' })
  })

  it('HTTP 200 但业务码非 200 时仍然抛错', async () => {
    // 信封允许这种组合。后端目前不会这么返回，但前端不该假设它不会来。
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      raw({ code: 40104, msg: '用户名或密码不正确', data: null }, 200),
    )
    try {
      await request('/api/v1/admin/login')
      expect.unreachable('应当抛错')
    } catch (e) {
      expect((e as ApiError).code).toBe(40104)
      expect((e as ApiError).message).toContain('不正确')
    }
  })

  it('后端没给 message 时用兜底文案，不显示错误码', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      raw({ code: 49999, data: null }, 500))
    try {
      await request('/x')
    } catch (e) {
      expect((e as ApiError).message).toBe('出了点问题，请稍后再试')
      expect((e as ApiError).message).not.toContain('WEIRD_CODE')
    }
  })

  it('响应不是 JSON 时也抛可读的 ApiError', async () => {
    // 这种响应不来自后端（后端永远返回信封），而来自挂掉的网关。
    // 解析不出信封就没有业务码，按网络错处理。
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
      expect((e as ApiError).code).toBe(CODE_NETWORK)
    }
  })

  it('登录态失效的业务码会清掉 token —— HTTP 状态仍是 200', async () => {
    setToken('stale')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      // 注意状态码是 200：靠 response.status === 401 判断会整个失灵
      raw({ code: CODE_TOKEN_INVALID, msg: '登录已失效，请重新登录', data: null }))
    await expect(request('/api/v1/admin/me')).rejects.toThrow(ApiError)
    expect(getToken()).toBeNull()
  })

  it('非登录类的失败不清 token', async () => {
    setToken('good')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      raw({ code: CODE_ART_IN_USE, msg: '这幅作品已被收藏', data: null }))
    await expect(request('/api/v1/admin/art/x')).rejects.toThrow(ApiError)
    expect(getToken()).toBe('good')
  })

  it('原本返回 204 的接口现在是 200 + data:null，调用方拿到 null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(null))
    await expect(request('/api/v1/admin/art/x', { method: 'DELETE' })).resolves.toBeNull()
  })

  it('token 存在 sessionStorage 而不是 localStorage', () => {
    setToken('tok-abc')
    expect(sessionStorage.getItem('zhusheng.admin.token')).toBe('tok-abc')
    expect(localStorage.getItem('zhusheng.admin.token')).toBeNull()
  })
})
