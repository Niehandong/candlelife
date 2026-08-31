import { describe, expect, it } from 'vitest'
import { countdownState, formatClock } from '../countdown-state'

const TZ = 'Asia/Shanghai'

describe('countdownState', () => {
  it('距离入睡尚早：prepare 相位', () => {
    const s = countdownState(new Date('2026-08-27T21:00:00+08:00'), '23:30', TZ)
    expect(s.phase).toBe('prepare')
    expect(s.seconds).toBe(150 * 60)
    expect(s.late).toBe(0)
  })

  it('十分钟内：near 相位', () => {
    const s = countdownState(new Date('2026-08-27T23:25:00+08:00'), '23:30', TZ)
    expect(s.phase).toBe('near')
    expect(s.seconds).toBe(5 * 60)
  })

  it('已过点：sleep 相位并给出迟到秒数', () => {
    const s = countdownState(new Date('2026-08-27T23:50:00+08:00'), '23:30', TZ)
    expect(s.phase).toBe('sleep')
    expect(s.seconds).toBe(0)
    expect(s.late).toBe(20 * 60)
  })

  it('凌晨计划时间不会算成整整一天之后', () => {
    const s = countdownState(new Date('2026-08-28T00:10:00+08:00'), '00:30', TZ)
    expect(s.seconds).toBe(20 * 60)     // 这是本用例的重点：20 分钟而非 24 小时
    expect(s.phase).toBe('prepare')     // 20 分钟 > 10 分钟阈值，尚未进入 near
  })

  it('恰好 10 分钟仍是 near，10 分 1 秒是 prepare', () => {
    expect(countdownState(new Date('2026-08-27T23:20:00+08:00'), '23:30', TZ).phase).toBe('near')
    expect(countdownState(new Date('2026-08-27T23:19:59+08:00'), '23:30', TZ).phase).toBe('prepare')
  })

  it('以用户时区为准，与设备时区无关', () => {
    const s = countdownState(new Date('2026-08-27T23:25:00+08:00'), '23:30', TZ)
    expect(s.seconds).toBe(5 * 60)
  })
})

describe('formatClock', () => {
  it('补零到两位并用空格分隔', () => {
    expect(formatClock(3661)).toBe('01 : 01 : 01')
    expect(formatClock(0)).toBe('00 : 00 : 00')
  })
})
