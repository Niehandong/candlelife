import Taro from '@tarojs/taro'
import { api } from '@/api/endpoints'
import type { ConfigResponse, MeResponse } from '@/api/types'
import { flushEvents } from '@/utils/events'
import { clearTokens, getAccessToken, setTokens } from './auth'
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

async function bootstrapWithRelogin(): Promise<{ config: ConfigResponse; me: MeResponse }> {
  try {
    return await bootstrap()
  } catch (error: any) {
    // 本地数据库重建、切换后端或 token 过期后，缓存中的旧 token 对新服务已无效。
    // 清掉后只重试一次，让 bootstrap 重新走 wx.login，避免每次启动都卡在旧登录态。
    if (getAccessToken() && error?.status === 401) {
      clearTokens()
      return bootstrap()
    }
    throw error
  }
}

/**
 * 引导流程自身的页面。停留在这里说明用户正在走引导，不该被拽回欢迎页。
 */
const ONBOARDING_ROUTES = ['pages/welcome/index', 'pages/guide/index', 'pages/story/index']

/**
 * App 每次前台化（useDidShow）都要跑一遍。断网时不能把用户困在一个没有出口的页面：
 * 引导页是纯静态的、不依赖网络，所以无论 bootstrap 成功与否，只要还没引导过，
 * 都要路由到欢迎页，让用户至少能看到产品、走完引导，而不是卡在空白的 home。
 *
 * 但 reLaunch 会关掉【所有】页面，所以必须先看当前在哪：不做这个判断的话，
 * 用户点「开始」进入引导后，下一次前台化（开发者工具每次重新编译也会触发）
 * 会把他刚点出来的那一页直接抹掉弹回欢迎页——表现出来就是「按钮点了没反应」。
 * 后端抖动时更明显：bootstrap 一失败就立刻走到 reLaunch，几乎每次都会被弹回。
 */
export async function routeAfterBootstrap(): Promise<void> {
  try {
    await bootstrapWithRelogin()
    void flushEvents()
  } catch (error: any) {
    const title = error?.message || '启动失败，请稍后再试'
    Taro.showToast({ title, icon: 'none' })
  }

  if (isOnboarded()) return

  const route = Taro.getCurrentPages().slice(-1)[0]?.route ?? ''
  // route 为空说明页面栈还没建起来（冷启动），这时按原设计落到欢迎页。
  if (route && ONBOARDING_ROUTES.includes(route)) return

  Taro.reLaunch({ url: '/pages/welcome/index' })
}
