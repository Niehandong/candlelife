import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: Record<string, any> = {}
const loginCalls: string[] = []
const reLaunchCalls: any[] = []
const toastCalls: any[] = []

vi.mock('@tarojs/taro', () => ({
  default: {
    login: () => { loginCalls.push('login'); return Promise.resolve({ code: 'CODE123' }) },
    getStorageSync: (k: string) => store[k] ?? '',
    setStorageSync: (k: string, v: any) => { store[k] = v },
    removeStorageSync: (k: string) => { delete store[k] },
    reLaunch: (opt: any) => { reLaunchCalls.push(opt); return Promise.resolve() },
    showToast: (opt: any) => { toastCalls.push(opt) },
  },
}))

const apiMock = {
  wxLogin: vi.fn(async () => ({ access_token: 'A', refresh_token: 'R' })),
  getConfig: vi.fn(async () => ({
    schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
    ritual: { tolerance_minutes: 30, gratitude_count: 3, plan_count: 3, resistance_options: [] },
    assets: { base_url: 'https://cdn.example' },
  })),
  getMe: vi.fn(async () => ({
    id: 'u1', nickname: null, avatar_url: null,
    settings: {
      bedtime: '23:30', wake_time: '07:30', timezone: 'Asia/Shanghai', reduced_motion: false,
    },
  })),
}
vi.mock('@/api/endpoints', () => ({ api: apiMock }))

beforeEach(() => {
  store = {}
  loginCalls.length = 0
  reLaunchCalls.length = 0
  toastCalls.length = 0
  Object.values(apiMock).forEach((f) => f.mockClear())
})

describe('bootstrap', () => {
  it('无 token 时静默登录并缓存配置', async () => {
    const { bootstrap } = await import('../session')
    const out = await bootstrap()
    expect(loginCalls).toHaveLength(1)
    expect(apiMock.wxLogin).toHaveBeenCalledWith('CODE123')
    expect(out.config.assets.base_url).toBe('https://cdn.example')
    expect(store['zhusheng-config-v1']).toBeTruthy()
  })

  it('已有 token 时不重复登录', async () => {
    store['zhusheng-access-token'] = 'EXISTING'
    const { bootstrap } = await import('../session')
    await bootstrap()
    expect(loginCalls).toHaveLength(0)
    expect(apiMock.wxLogin).not.toHaveBeenCalled()
  })

  it('引导状态可持久化', async () => {
    const { isOnboarded, markOnboarded } = await import('../session')
    expect(isOnboarded()).toBe(false)
    markOnboarded()
    expect(isOnboarded()).toBe(true)
  })
})

describe('routeAfterBootstrap', () => {
  it('★ 断网（bootstrap 失败）时仍要路由到欢迎页，不能把用户困住', async () => {
    apiMock.getConfig.mockRejectedValueOnce(new Error('network down'))
    const { routeAfterBootstrap } = await import('../session')
    await routeAfterBootstrap()
    expect(toastCalls).toEqual([{ title: 'network down', icon: 'none' }])
    expect(reLaunchCalls).toEqual([{ url: '/pages/welcome/index' }])
  })

  it('bootstrap 成功但未引导过时也要路由到欢迎页', async () => {
    const { routeAfterBootstrap } = await import('../session')
    await routeAfterBootstrap()
    expect(reLaunchCalls).toEqual([{ url: '/pages/welcome/index' }])
  })

  it('已引导过时不重复跳转', async () => {
    store['zhusheng-onboarded-v1'] = 'true'
    const { routeAfterBootstrap } = await import('../session')
    await routeAfterBootstrap()
    expect(reLaunchCalls).toHaveLength(0)
  })
})
