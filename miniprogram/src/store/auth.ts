import Taro from '@tarojs/taro'

const ACCESS = 'zhusheng-access-token'
const REFRESH = 'zhusheng-refresh-token'

export type TokenPair = { access_token: string; refresh_token: string }

export function setTokens(t: TokenPair): void {
  Taro.setStorageSync(ACCESS, t.access_token)
  Taro.setStorageSync(REFRESH, t.refresh_token)
}

export function setAccessToken(token: string): void {
  Taro.setStorageSync(ACCESS, token)
}

export const getAccessToken = (): string => Taro.getStorageSync(ACCESS) || ''
export const getRefreshToken = (): string => Taro.getStorageSync(REFRESH) || ''

export function clearTokens(): void {
  Taro.removeStorageSync(ACCESS)
  Taro.removeStorageSync(REFRESH)
}
