import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: Record<string, any> = {}
const calls: any[] = []
const responses: any[] = []
let failNext = false

vi.mock('@tarojs/taro', () => ({
  default: {
    request: (opts: any) => {
      if (failNext) { failNext = false; return Promise.reject(new Error('offline')) }
      calls.push(opts)
      return Promise.resolve(responses.shift() ?? { statusCode: 200, data: {} })
    },
    getStorageSync: (k: string) => store[k] ?? '',
    setStorageSync: (k: string, v: any) => { store[k] = v },
    removeStorageSync: (k: string) => { delete store[k] },
  },
}))

beforeEach(() => { store = {}; calls.length = 0; responses.length = 0; failNext = false })

describe('request', () => {
  it('带上 Authorization 头', async () => {
    const { setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'AAA', refresh_token: 'RRR' })
    responses.push({ statusCode: 200, data: { ok: true } })
    await request({ path: '/api/v1/me' })
    expect(calls[0].header.Authorization).toBe('Bearer AAA')
  })

  it('公开接口不带 Authorization', async () => {
    const { request } = await import('../client')
    responses.push({ statusCode: 200, data: {} })
    await request({ path: '/api/v1/config', auth: false })
    expect(calls[0].header.Authorization).toBeUndefined()
  })

  it('把错误信封抛成 ApiError', async () => {
    const { request } = await import('../client')
    responses.push({ statusCode: 409, data: { code: 'RECORD_LOCKED', message: '已固化' } })
    await expect(request({ path: '/api/v1/nights/2026-08-27', method: 'PATCH' }))
      .rejects.toMatchObject({ code: 'RECORD_LOCKED', status: 409 })
  })

  it('401 时用 refresh_token 换新 access 并重试一次', async () => {
    const { getAccessToken, setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'OLD', refresh_token: 'RRR' })
    responses.push({ statusCode: 401, data: { code: 'TOKEN_INVALID', message: '' } })
    responses.push({ statusCode: 200, data: { access_token: 'NEW' } })
    responses.push({ statusCode: 200, data: { id: 'u1' } })

    const out = await request<{ id: string }>({ path: '/api/v1/me' })
    expect(out.id).toBe('u1')
    expect(getAccessToken()).toBe('NEW')
    expect(calls[2].header.Authorization).toBe('Bearer NEW')
  })

  it('刷新也失败时清空 token 并抛错', async () => {
    const { getAccessToken, setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'OLD', refresh_token: 'BAD' })
    responses.push({ statusCode: 401, data: { code: 'TOKEN_INVALID', message: '' } })
    responses.push({ statusCode: 401, data: { code: 'TOKEN_INVALID', message: '' } })

    await expect(request({ path: '/api/v1/me' })).rejects.toMatchObject({ status: 401 })
    expect(getAccessToken()).toBe('')
  })

  it('网络失败抛出 NETWORK_UNAVAILABLE', async () => {
    const { request } = await import('../client')
    failNext = true
    await expect(request({ path: '/api/v1/config', auth: false }))
      .rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE', status: 0 })
  })
})
