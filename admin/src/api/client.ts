/**
 * fetch 封装。
 *
 * 错误文案直接用后端的 message——后端已补全中文（app/core/errors.py 的
 * ERROR_MESSAGES）。这里刻意不再维护一张码→中文的映射表：那正是阶段一在
 * 小程序端做过、并被认定为「治标」的做法，根因已在后端修掉。
 */

const TOKEN_KEY = 'zhusheng.admin.token'
const FALLBACK_MESSAGE = '出了点问题，请稍后再试'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
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
    throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查后端是否在运行')
  }

  if (response.status === 401) clearToken()

  if (response.status === 204) return undefined as T

  let body: unknown = undefined
  try {
    // text() 本身也会抛（body 已被消费、连接中断），那同样是「请求没成功」，
    // 不能冒泡成裸 TypeError——调用方 catch 的是 ApiError。
    const text = await response.text()
    if (text) body = JSON.parse(text)
  } catch {
    body = undefined
  }

  if (!response.ok) {
    const envelope = (body ?? {}) as { code?: string; message?: string; detail?: unknown }
    throw new ApiError(
      response.status,
      envelope.code ?? 'HTTP_ERROR',
      envelope.message || FALLBACK_MESSAGE,
      envelope.detail,
    )
  }

  return body as T
}
