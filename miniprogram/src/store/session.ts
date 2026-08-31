import Taro from '@tarojs/taro'
import { api } from '@/api/endpoints'
import type { ConfigResponse, MeResponse } from '@/api/types'
import { flushEvents } from '@/utils/events'
import { getAccessToken, setTokens } from './auth'
import { saveConfig } from './runtime-config'

const ONBOARDED = 'zhusheng-onboarded-v1'

export const isOnboarded = (): boolean => Taro.getStorageSync(ONBOARDED) === 'true'
export const markOnboarded = (): void => Taro.setStorageSync(ONBOARDED, 'true')

/** 静默登录 + 拉取配置与用户设置。用户全程无感，延续「不强制登录」的原则。 */
export async function bootstrap(): Promise<{ config: ConfigResponse; me: MeResponse }> {
  if (!getAccessToken()) {
    const { code } = await Taro.login()
    setTokens(await api.wxLogin(code))
  }
  const [config, me] = await Promise.all([api.getConfig(), api.getMe()])
  saveConfig(config)
  return { config, me }
}

/**
 * App 每次前台化（useDidShow）都要跑一遍。断网时不能把用户困在一个没有出口的页面：
 * 引导页是纯静态的、不依赖网络，所以无论 bootstrap 成功与否，只要还没引导过，
 * 都要路由到欢迎页，让用户至少能看到产品、走完引导，而不是卡在空白的 home。
 */
export async function routeAfterBootstrap(): Promise<void> {
  try {
    await bootstrap()
    void flushEvents()
  } catch {
    Taro.showToast({ title: '网络不可用', icon: 'none' })
  }
  if (!isOnboarded()) Taro.reLaunch({ url: '/pages/welcome/index' })
}
