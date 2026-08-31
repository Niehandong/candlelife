import Taro from '@tarojs/taro'
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from '@/store/auth'

declare const API_BASE_URL: string

export type ApiError = { code: string; message: string; detail?: unknown; status: number }

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

// 后端 _envelope(code, code) 会把 message 字段直接写成错误码本身（VALIDATION_ERROR /
// INTERNAL_ERROR 走的是另一条 handler，已经是中文，这里原样兜底）。页面里非特判分支
// 会直接 toast(err.message)，不能让用户看见英文错误码。
// code 保持原样不动——页面靠它做特判（如 RECORD_LOCKED、NETWORK_UNAVAILABLE）。
const ERROR_MESSAGES: Record<string, string> = {
  TOKEN_MISSING: '登录状态已失效，请重新登录',
  TOKEN_INVALID: '登录状态已失效，请重新登录',
  TOKEN_KIND_MISMATCH: '登录状态异常，请重新登录',
  WX_CODE_INVALID: '微信登录信息已过期，请重新进入小程序再试',
  WX_TOKEN_UNAVAILABLE: '微信登录服务暂时不可用，请稍后再试',
  USER_NOT_FOUND: '没有找到这个账号，请重新登录',
  NICKNAME_REJECTED: '这个昵称不能使用，换一个再试',
  NIGHT_NOT_FOUND: '没有找到这条夜记',
  RECORD_LOCKED: '这一晚已经定下了',
  ART_NOT_FOUND: '没有找到这幅作品',
  ART_WITHDRAWN: '这幅作品已经下架，不再展示',
  DECRYPT_FAILED: '这条记录暂时读不出来，其余信息不受影响',
  VALIDATION_ERROR: '请求参数不合法',
  INTERNAL_ERROR: '服务器出了点问题，请稍后再试',
}

function toApiError(statusCode: number, data: any): ApiError {
  const code = data?.code ?? 'UNKNOWN'
  return {
    code,
    message: ERROR_MESSAGES[code] ?? '出了点问题，请稍后再试',
    detail: data?.detail,
    status: statusCode,
  }
}

async function raw(path: string, method: Method, data: unknown, token: string) {
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) header.Authorization = `Bearer ${token}`
  try {
    return await Taro.request({ url: `${API_BASE_URL}${path}`, method, data, header })
  } catch {
    // 睡前场景常见飞行模式/弱网。离线完成不在阶段一范围，此处直接告知用户。
    throw { code: 'NETWORK_UNAVAILABLE', message: '网络不可用，请稍后再试', status: 0 } as ApiError
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (!refresh) return false
  const res = await raw('/api/v1/auth/refresh', 'POST', { refresh_token: refresh }, '')
  const token = (res.data as any)?.access_token
  if (res.statusCode === 200 && token) {
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

  if (res.statusCode === 401 && auth) {
    if (await refreshAccessToken()) {
      res = await raw(path, method, data, getAccessToken())   // 只重试一次
    } else {
      clearTokens()
    }
  }

  if (res.statusCode >= 200 && res.statusCode < 300) return res.data as T
  throw toApiError(res.statusCode, res.data)
}
