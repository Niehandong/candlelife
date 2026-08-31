import { beforeEach, describe, expect, it, vi } from 'vitest'

const nav: string[] = []
vi.mock('@tarojs/taro', () => ({
  default: {
    navigateTo: (o: { url: string }) => { nav.push(o.url); return Promise.resolve() },
    getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {},
  },
}))

const apiMock = { pendingRewards: vi.fn(), revealRewards: vi.fn() }
vi.mock('@/api/endpoints', () => ({ api: apiMock }))

beforeEach(async () => {
  nav.length = 0
  vi.clearAllMocks()
  // checkAndRoute 有模块级的「每次启动最多自动跳一次」闸门（见 N2），
  // 各用例之间必须重置，否则后面的用例会被前面用例置位的 attempted 污染。
  const { __resetForTest } = await import('../reveal')
  __resetForTest()
})

describe('checkAndRoute', () => {
  it('无可揭晓时不跳转，也不消耗奖励', async () => {
    apiMock.pendingRewards.mockResolvedValue({ revealable: false, ritual_dates: [] })
    const { checkAndRoute } = await import('../reveal')
    expect(await checkAndRoute()).toBe(false)
    expect(nav).toHaveLength(0)
    expect(apiMock.revealRewards).not.toHaveBeenCalled()
  })

  it('有可揭晓时跳转到奖励页', async () => {
    apiMock.pendingRewards.mockResolvedValue({ revealable: true, ritual_dates: ['2026-08-27'] })
    const { checkAndRoute } = await import('../reveal')
    expect(await checkAndRoute()).toBe(true)
    expect(nav[0]).toContain('/pages/reward/index')
  })

  it('网络失败时安静返回 false，不打断用户', async () => {
    apiMock.pendingRewards.mockRejectedValue({ code: 'NETWORK_UNAVAILABLE' })
    const { checkAndRoute } = await import('../reveal')
    expect(await checkAndRoute()).toBe(false)
    expect(nav).toHaveLength(0)
  })

  it('单次启动内命中一次后，再次调用不再跳转（防 home↔reward 弹跳）', async () => {
    apiMock.pendingRewards.mockResolvedValue({ revealable: true, ritual_dates: ['2026-08-27'] })
    const { checkAndRoute } = await import('../reveal')
    expect(await checkAndRoute()).toBe(true)
    expect(await checkAndRoute()).toBe(false)
    expect(nav).toHaveLength(1)
  })

  it('网络失败不置位闸门——恢复网络后仍能正常揭晓', async () => {
    apiMock.pendingRewards.mockRejectedValueOnce({ code: 'NETWORK_UNAVAILABLE' })
    apiMock.pendingRewards.mockResolvedValueOnce({ revealable: true, ritual_dates: ['2026-08-27'] })
    const { checkAndRoute } = await import('../reveal')
    expect(await checkAndRoute()).toBe(false)
    expect(await checkAndRoute()).toBe(true)
    expect(nav).toHaveLength(1)
  })
})
