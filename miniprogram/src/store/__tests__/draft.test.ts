import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: Record<string, any> = {}
vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync: (k: string) => store[k] ?? '',
    setStorageSync: (k: string, v: any) => { store[k] = v },
    removeStorageSync: (k: string) => { delete store[k] },
  },
}))

beforeEach(() => { store = {} })

const TZ = 'Asia/Shanghai'

describe('草稿绑定仪式夜', () => {
  it('新草稿带上当前仪式夜', async () => {
    const { loadDraft } = await import('../draft')
    const d = loadDraft(new Date('2026-08-27T22:00:00+08:00'), TZ)
    expect(d.ritualNight).toBe('2026-08-27')
    expect(d.gratitudes).toEqual([])
    expect(d.step).toBe('resistance')
  })

  it('同一仪式夜内草稿保留（凌晨仍属前一晚）', async () => {
    const { loadDraft, saveDraft } = await import('../draft')
    saveDraft({
      ritualNight: '2026-08-27', gratitudes: ['今晚写的'], plans: [],
      resistanceReason: '我还在刷手机', step: 'gratitude',
    })
    const d = loadDraft(new Date('2026-08-28T01:00:00+08:00'), TZ)
    expect(d.gratitudes).toEqual(['今晚写的'])
    expect(d.step).toBe('gratitude')
  })

  it('★ 跨夜后草稿作废，不污染新一晚', async () => {
    const { loadDraft, saveDraft } = await import('../draft')
    saveDraft({
      ritualNight: '2026-08-27', gratitudes: ['昨晚的内容'], plans: ['昨晚的计划'],
      resistanceReason: null, step: 'plan',
    })
    const d = loadDraft(new Date('2026-08-28T22:00:00+08:00'), TZ)
    expect(d.ritualNight).toBe('2026-08-28')
    expect(d.gratitudes).toEqual([])
    expect(d.plans).toEqual([])
    expect(d.step).toBe('resistance')
  })

  it('clearDraft 后重新开始', async () => {
    const { clearDraft, loadDraft, saveDraft } = await import('../draft')
    saveDraft({
      ritualNight: '2026-08-27', gratitudes: ['x'], plans: [],
      resistanceReason: null, step: 'quiet',
    })
    clearDraft()
    expect(loadDraft(new Date('2026-08-27T22:00:00+08:00'), TZ).gratitudes).toEqual([])
  })

  it('★ 边界：次日 05:59 仍属前一晚，草稿保留', async () => {
    const { loadDraft, saveDraft } = await import('../draft')
    saveDraft({
      ritualNight: '2026-08-27', gratitudes: ['边界内'], plans: [],
      resistanceReason: null, step: 'gratitude',
    })
    const d = loadDraft(new Date('2026-08-28T05:59:00+08:00'), TZ)
    expect(d.ritualNight).toBe('2026-08-27')
    expect(d.gratitudes).toEqual(['边界内'])
  })

  it('★ 边界：次日 06:00 已属新一晚，草稿作废', async () => {
    const { loadDraft, saveDraft } = await import('../draft')
    saveDraft({
      ritualNight: '2026-08-27', gratitudes: ['边界外'], plans: [],
      resistanceReason: null, step: 'gratitude',
    })
    const d = loadDraft(new Date('2026-08-28T06:00:00+08:00'), TZ)
    expect(d.ritualNight).toBe('2026-08-28')
    expect(d.gratitudes).toEqual([])
    expect(d.step).toBe('resistance')
  })

  it('存储中 step/resistanceReason 为非法值时降级', async () => {
    store['zhusheng-draft-v1'] = JSON.stringify({
      ritualNight: '2026-08-27', gratitudes: [], plans: [],
      resistanceReason: 123, step: '不存在的步骤',
    })
    const { loadDraft } = await import('../draft')
    const d = loadDraft(new Date('2026-08-27T22:00:00+08:00'), TZ)
    expect(d.step).toBe('resistance')
    expect(d.resistanceReason).toBeNull()
  })

  it('存储中的坏数据不致崩溃', async () => {
    store['zhusheng-draft-v1'] = '{ 不是合法 JSON'
    const { loadDraft } = await import('../draft')
    expect(loadDraft(new Date('2026-08-27T22:00:00+08:00'), TZ).gratitudes).toEqual([])
  })
})

describe('toIsoWithOffset', () => {
  it('输出带偏移的 ISO 而非 Z', async () => {
    const { toIsoWithOffset } = await import('@/utils/time')
    const s = toIsoWithOffset(new Date('2026-08-27T23:50:00+08:00'))
    expect(s).toMatch(/[+-]\d{2}:\d{2}$/)
    expect(new Date(s).getTime()).toBe(new Date('2026-08-27T23:50:00+08:00').getTime())
  })
})

describe('runtime-config：坏数据降级', () => {
  it('存储中是 {} 时 loadConfig 返回 null', async () => {
    store['zhusheng-config-v1'] = '{}'
    const { loadConfig } = await import('../runtime-config')
    expect(loadConfig()).toBeNull()
  })

  it('存储中缺 ritual 字段时 loadConfig 返回 null', async () => {
    store['zhusheng-config-v1'] = JSON.stringify({ schedule: { bedtime: '23:30' } })
    const { loadConfig } = await import('../runtime-config')
    expect(loadConfig()).toBeNull()
  })

  it('顶层齐全但 resistance_options 不是数组时 loadConfig 返回 null', async () => {
    store['zhusheng-config-v1'] = JSON.stringify({
      schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
      ritual: { tolerance_minutes: 30, gratitude_count: 3, plan_count: 3, resistance_options: '不是数组' },
      assets: { base_url: '' },
    })
    const { loadConfig } = await import('../runtime-config')
    expect(loadConfig()).toBeNull()
  })

  it('顶层齐全但 schedule 缺 min_time 时 loadConfig 返回 null', async () => {
    store['zhusheng-config-v1'] = JSON.stringify({
      schedule: { bedtime: '23:30', wake_time: '07:30', max_time: '02:00' },
      ritual: { tolerance_minutes: 30, gratitude_count: 3, plan_count: 3, resistance_options: [] },
      assets: { base_url: '' },
    })
    const { loadConfig } = await import('../runtime-config')
    expect(loadConfig()).toBeNull()
  })

  it('顶层齐全但 assets 是空对象（缺 base_url）时 loadConfig 返回 null', async () => {
    store['zhusheng-config-v1'] = JSON.stringify({
      schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
      ritual: { tolerance_minutes: 30, gratitude_count: 3, plan_count: 3, resistance_options: [] },
      assets: {},
    })
    const { loadConfig } = await import('../runtime-config')
    expect(loadConfig()).toBeNull()
  })

  it('顶层齐全但 gratitude_count 是字符串时 loadConfig 返回 null', async () => {
    store['zhusheng-config-v1'] = JSON.stringify({
      schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
      ritual: { tolerance_minutes: 30, gratitude_count: '3', plan_count: 3, resistance_options: [] },
      assets: { base_url: '' },
    })
    const { loadConfig } = await import('../runtime-config')
    expect(loadConfig()).toBeNull()
  })

  it('完整合法的配置能正常读回（防止校验过严）', async () => {
    const valid = {
      schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
      ritual: {
        tolerance_minutes: 30, gratitude_count: 3, plan_count: 3,
        resistance_options: ['我还在刷手机', '我还在工作', '我还不困', '我舍不得结束今天'],
      },
      assets: { base_url: 'https://cdn.example.com' },
    }
    store['zhusheng-config-v1'] = JSON.stringify(valid)
    const { loadConfig } = await import('../runtime-config')
    expect(loadConfig()).toEqual(valid)
  })
})
