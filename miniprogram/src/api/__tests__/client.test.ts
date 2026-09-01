import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CODE_NETWORK_UNAVAILABLE, CODE_OK, CODE_RECORD_LOCKED, CODE_TOKEN_INVALID,
} from '../codes'

/** 后端统一信封 {code, msg, data} —— 成功响应的载荷包在 data 里。
 *
 *  这两个 helper 必须用【函数声明】而不是 const：vi.mock 的工厂会被提升到
 *  文件最顶端执行，那时 const 还在暂时性死区里，会报 "ok is not defined"。 */
function ok(data: unknown) {
  return { code: CODE_OK, msg: 'success', data }
}
function fail(code: number, msg: string) {
  return { code, msg, data: null }
}

let store: Record<string, any> = {}
const calls: any[] = []
const responses: any[] = []
let failNext = false

vi.mock('@tarojs/taro', () => ({
  default: {
    request: (opts: any) => {
      if (failNext) { failNext = false; return Promise.reject(new Error('offline')) }
      calls.push(opts)
      return Promise.resolve(responses.shift() ?? { statusCode: 200, data: ok({}) })
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
    responses.push({ statusCode: 200, data: ok({ ok: true }) })
    await request({ path: '/api/v1/me' })
    expect(calls[0].header.Authorization).toBe('Bearer AAA')
  })

  it('公开接口不带 Authorization', async () => {
    const { request } = await import('../client')
    responses.push({ statusCode: 200, data: ok({}) })
    await request({ path: '/api/v1/config', auth: false })
    expect(calls[0].header.Authorization).toBeUndefined()
  })

  it('把错误信封抛成 ApiError —— HTTP 状态是 200，成败只看业务码', async () => {
    const { request } = await import('../client')
    // statusCode 刻意是 200：后端 /api 下的失败也返回 200，
    // 客户端若还在看 res.statusCode 就会把这个失败当成功放过去。
    responses.push({ statusCode: 200, data: fail(CODE_RECORD_LOCKED, '这一晚已经定下了') })
    await expect(request({ path: '/api/v1/nights/2026-08-27', method: 'PATCH' }))
      .rejects.toMatchObject({ code: CODE_RECORD_LOCKED })
  })

  it('401 时用 refresh_token 换新 access 并重试一次', async () => {
    const { getAccessToken, setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'OLD', refresh_token: 'RRR' })
    // 三次响应的 HTTP 状态全是 200；触发刷新的是业务码 40102，不是 401
    responses.push({ statusCode: 200, data: fail(CODE_TOKEN_INVALID, '登录已失效，请重新登录') })
    responses.push({ statusCode: 200, data: ok({ access_token: 'NEW' }) })
    responses.push({ statusCode: 200, data: ok({ id: 'u1' }) })

    const out = await request<{ id: string }>({ path: '/api/v1/me' })
    expect(out.id).toBe('u1')
    expect(getAccessToken()).toBe('NEW')
    expect(calls[2].header.Authorization).toBe('Bearer NEW')
  })

  it('刷新也失败时清空 token 并抛错', async () => {
    const { getAccessToken, setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'OLD', refresh_token: 'BAD' })
    responses.push({ statusCode: 200, data: fail(CODE_TOKEN_INVALID, '登录已失效，请重新登录') })
    responses.push({ statusCode: 200, data: fail(CODE_TOKEN_INVALID, '登录已失效，请重新登录') })

    await expect(request({ path: '/api/v1/me' }))
      .rejects.toMatchObject({ code: CODE_TOKEN_INVALID })
    expect(getAccessToken()).toBe('')
  })

  it('网络失败抛出 NETWORK_UNAVAILABLE', async () => {
    const { request } = await import('../client')
    failNext = true
    await expect(request({ path: '/api/v1/config', auth: false }))
      .rejects.toMatchObject({ code: CODE_NETWORK_UNAVAILABLE })
  })

  it('原本返回 204 的接口现在是 200 + data:null', async () => {
    const { setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'AAA', refresh_token: 'RRR' })
    responses.push({ statusCode: 200, data: ok(null) })
    await expect(request({ path: '/api/v1/me', method: 'DELETE' })).resolves.toBeNull()
  })

  it('非登录类的失败不触发刷新流程', async () => {
    const { getAccessToken, setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'AAA', refresh_token: 'RRR' })
    responses.push({ statusCode: 200, data: fail(CODE_RECORD_LOCKED, '这一晚已经定下了') })

    await expect(request({ path: '/api/v1/nights/2026-08-27', method: 'PATCH' }))
      .rejects.toMatchObject({ code: CODE_RECORD_LOCKED })
    // 只发了一次请求 —— 没有多余的 refresh
    expect(calls.length).toBe(1)
    expect(getAccessToken()).toBe('AAA')
  })
})
