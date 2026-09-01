/**
 * fetch 封装。
 *
 * 错误文案直接用后端的 message——后端已补全中文（app/core/errors.py 的
 * ERROR_MESSAGES）。这里刻意不再维护一张码→中文的映射表：那正是阶段一在
 * 小程序端做过、并被认定为「治标」的做法，根因已在后端修掉。
 */

import { CODE_NETWORK, CODE_OK, SESSION_DEAD_CODES } from './codes'

const TOKEN_KEY = 'zhusheng.admin.token'
const FALLBACK_MESSAGE = '出了点问题，请稍后再试'

/** 后端统一响应信封 —— 成功失败都是这个形状 */
interface Envelope<T> {
  code: number      // 200 = 成功；其余是业务错误码，编号规则见 backend/app/core/codes.py
  msg: string
  data: T
}

export class ApiError extends Error {
  constructor(
    /**
     * 业务错误码。40101 这种数字，**不是 HTTP 状态码**。
     *
     * 后端 /api 下的 HTTP 状态一律 200（见 backend/app/core/codes.py），
     * 判断成败与分支只看这个字段。同一段 401xx 里，「密码错」40104 与
     * 「登录已失效」40102 是两回事，要分开提示。
     *
     * 刻意【不再保留 status 字段】：它现在恒为 200，留着只会诱导调用方
     * 去判断一个没有信息量的值。
     */
    readonly code: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// sessionStorage 而非 localStorage：关掉标签页 token 就该消失，
// 共用电脑上不留一张 8 小时有效的通行证。
export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError(CODE_NETWORK, '网络连接失败，请检查后端是否在运行')
  }

  let body: unknown = undefined
  try {
    // text() 本身也会抛（body 已被消费、连接中断），那同样是「请求没成功」，
    // 不能冒泡成裸 TypeError——调用方 catch 的是 ApiError。
    const text = await response.text()
    if (text) body = JSON.parse(text)
  } catch {
    body = undefined
  }

  const envelope = (body ?? {}) as Partial<Envelope<unknown>>

  // 成败【只看业务码】。后端 /api 下的 HTTP 状态一律 200，
  // 原来的 `response.status === 401` / `!response.ok` 现在永远不成立，
  // 照旧写会让登出与报错整个失灵。
  const code = typeof envelope.code === 'number' ? envelope.code : CODE_NETWORK

  if (code !== CODE_OK) {
    // 登录态已死就清 token，路由守卫会把人送回登录页
    if (SESSION_DEAD_CODES.includes(code)) clearToken()
    throw new ApiError(code, envelope.msg || FALLBACK_MESSAGE, envelope.data)
  }

  // 拆信封，把 data 交给调用方 —— 上层拿到的仍是业务对象，不用到处写 .data
  // 原本返回 204 空体的接口现在也走这里，data 是 null。
  return envelope.data as T
}
