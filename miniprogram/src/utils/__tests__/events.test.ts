import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: Record<string, any> = {}
vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync: (k: string) => store[k] ?? '',
    setStorageSync: (k: string, v: any) => { store[k] = v },
    removeStorageSync: (k: string) => { delete store[k] },
  },
}))

const postEvents = vi.fn(async (_events: unknown[]) => undefined)
vi.mock('@/api/endpoints', () => ({ api: { postEvents } }))

beforeEach(() => { store = {}; postEvents.mockClear() })

describe('匿名事件', () => {
  it('入队后可批量上报并清空', async () => {
    const { flushEvents, queueEvent } = await import('../events')
    queueEvent('ritual_completed', { eligible: true })
    queueEvent('reward_revealed', { draws: 2 })
    await flushEvents()
    expect(postEvents).toHaveBeenCalledTimes(1)
    expect(postEvents.mock.calls[0]![0]).toHaveLength(2)
    await flushEvents()
    expect(postEvents).toHaveBeenCalledTimes(1)     // 队列已空，不再发
  })

  it('★ 剥掉正文字段——后端 schema 也会拒收，此处是第一道闸', async () => {
    const { flushEvents, queueEvent } = await import('../events')
    queueEvent('ritual_completed', {
      eligible: true, gratitudes: ['私人内容'], plans: ['私人计划'], nickname: '张三',
    })
    await flushEvents()
    const sent = postEvents.mock.calls[0]![0] as any[]
    expect(sent[0].payload).toEqual({ eligible: true })
  })

  it('上报失败时保留队列，下次再试', async () => {
    postEvents.mockRejectedValueOnce(new Error('offline'))
    const { flushEvents, queueEvent } = await import('../events')
    queueEvent('t', {})
    await flushEvents()
    await flushEvents()
    expect(postEvents).toHaveBeenCalledTimes(2)
  })

  it('队列有上限，不无限增长', async () => {
    const { flushEvents, queueEvent } = await import('../events')
    for (let i = 0; i < 250; i++) queueEvent('t', { i })
    await flushEvents()
    expect((postEvents.mock.calls[0]![0] as any[]).length).toBeLessThanOrEqual(200)
  })
})
