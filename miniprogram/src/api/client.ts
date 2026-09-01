import Taro from '@tarojs/taro'
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from '@/store/auth'
import { CODE_NETWORK_UNAVAILABLE, CODE_OK, isSessionDead } from './codes'

declare const API_BASE_URL: string

/** 后端统一响应信封 —— 成功失败都是这个形状 */
interface Envelope<T> {
  code: number      // 200 = 成功；其余是业务错误码，见 ./codes.ts
  msg: string
  data: T
}

export type ApiError = {
  /**
   * 业务错误码。40101 这种数字，**不是 HTTP 状态码**。
   *
   * 后端 /api 下的 HTTP 状态一律 200，判断成败只看这个字段。
   * 页面里要特判某种失败时，比对 ./codes.ts 里的常量，不要比对数字字面量。
   */
  code: number
  message: string
  detail?: unknown
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const FALLBACK_MESSAGE = '出了点问题，请稍后再试'

/**
 * 从信封里取错误。
 *
 * 文案直接用后端给的 msg —— 后端的 ERROR_MESSAGES 已经是面向用户的中文。
 * 这里【刻意不再维护一张码→中文的映射表】：那是阶段一的做法，两边各写一份
 * 文案迟早对不上，而且新增错误码时前端不改就会显示兜底话术。
 */
function toApiError(body: unknown): ApiError {
  const envelope = (body ?? {}) as Partial<Envelope<unknown>>
  return {
    code: typeof envelope.code === 'number' ? envelope.code : CODE_NETWORK_UNAVAILABLE,
    message: envelope.msg || FALLBACK_MESSAGE,
    detail: envelope.data,
  }
}

/** 从一次响应里取出业务码。拿不到（网络层没走通、响应不是信封）时按网络错处理。 */
function codeOf(body: unknown): number {
  const envelope = (body ?? {}) as Partial<Envelope<unknown>>
  return typeof envelope.code === 'number' ? envelope.code : CODE_NETWORK_UNAVAILABLE
}

async function raw(path: string, method: Method, data: unknown, token: string) {
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) header.Authorization = `Bearer ${token}`
  try {
    return await Taro.request({ url: `${API_BASE_URL}${path}`, method, data, header })
  } catch {
    // 睡前场景常见飞行模式/弱网。离线完成不在阶段一范围，此处直接告知用户。
    throw {
      code: CODE_NETWORK_UNAVAILABLE,
      message: '网络不可用，请稍后再试',
    } as ApiError
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (!refresh) return false
  const res = await raw('/api/v1/auth/refresh', 'POST', { refresh_token: refresh }, '')
  const envelope = (res.data ?? {}) as Partial<Envelope<{ access_token?: string }>>
  const token = envelope?.data?.access_token
  // 只看业务码，不看 res.statusCode —— 后端 /api 下永远是 200
  if (envelope.code === CODE_OK && token) {
    setAccessToken(token)
    return true
  }
  return false
}

export async function request<T>(opts: {
  path: string; method?: Method; data?: unknown; auth?: boolean
}): Promise<T> {
  const { path, method = 'GET', data, auth = true } = opts
  let res = await raw(path, method, data, auth ? getAccessToken() : '')

  // 【判断依据是业务码，不是 HTTP 状态】后端 /api 下的失败也返回 200，
  // 原来的 `res.statusCode === 401` 现在永远不成立，刷新流程会整个失灵。
  if (auth && isSessionDead(codeOf(res.data))) {
    if (await refreshAccessToken()) {
      res = await raw(path, method, data, getAccessToken())   // 只重试一次
    } else {
      clearTokens()
    }
  }

  const envelope = (res.data ?? {}) as Partial<Envelope<T>>
  if (envelope.code !== CODE_OK) {
    throw toApiError(res.data)
  }

  // 拆信封，把 data 交给调用方 —— 上层拿到的仍是业务对象
  return envelope.data as T
}
