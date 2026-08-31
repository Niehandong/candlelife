import { describe, expect, it } from 'vitest'
import type { Draft } from '@/store/draft'
import { RITUAL_STEPS, canAdvance, nextStep, prevStep } from '../steps'

const draft = (over: Partial<Draft> = {}): Draft => ({
  ritualNight: '2026-08-27', gratitudes: [], plans: [],
  resistanceReason: null, step: 'resistance', ...over,
})

describe('步骤顺序', () => {
  it('五步顺序与原型一致', () => {
    expect(RITUAL_STEPS).toEqual(['resistance', 'gratitude', 'plan', 'prep', 'quiet'])
  })

  it('首尾边界返回 null', () => {
    expect(prevStep('resistance')).toBeNull()
    expect(nextStep('quiet')).toBeNull()
    expect(nextStep('resistance')).toBe('gratitude')
    expect(prevStep('plan')).toBe('gratitude')
  })
})

describe('canAdvance', () => {
  it('阻力步必须选一个原因', () => {
    expect(canAdvance('resistance', draft())).toBe(false)
    expect(canAdvance('resistance', draft({ resistanceReason: '我还在刷手机' }))).toBe(true)
  })

  it('感恩步至少写一条', () => {
    expect(canAdvance('gratitude', draft())).toBe(false)
    expect(canAdvance('gratitude', draft({ gratitudes: ['阳光'] }))).toBe(true)
  })

  it('计划步至少写一条', () => {
    expect(canAdvance('plan', draft({ gratitudes: ['x'] }))).toBe(false)
    expect(canAdvance('plan', draft({ gratitudes: ['x'], plans: ['早起'] }))).toBe(true)
  })

  it('准备与安静步无输入要求', () => {
    expect(canAdvance('prep', draft())).toBe(true)
    expect(canAdvance('quiet', draft())).toBe(true)
  })

  it('空白字符不算有效输入', () => {
    expect(canAdvance('gratitude', draft({ gratitudes: ['   '] }))).toBe(false)
  })
})
