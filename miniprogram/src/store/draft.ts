import Taro from '@tarojs/taro'
import { currentRitualNight } from '@/domain/ritual'

const KEY = 'zhusheng-draft-v1'

export type RitualStep = 'resistance' | 'gratitude' | 'plan' | 'prep' | 'quiet'

const STEPS: RitualStep[] = ['resistance', 'gratitude', 'plan', 'prep', 'quiet']

export type Draft = {
  /** 所属仪式夜。换夜即作废——原型缺陷，见 spec 修正 5。 */
  ritualNight: string
  gratitudes: string[]
  plans: string[]
  resistanceReason: string | null
  step: RitualStep
}

const empty = (ritualNight: string): Draft => ({
  ritualNight, gratitudes: [], plans: [], resistanceReason: null, step: 'resistance',
})

export function loadDraft(now: Date, tz: string): Draft {
  const night = currentRitualNight(now, tz)
  try {
    const raw = Taro.getStorageSync(KEY)
    if (!raw) return empty(night)
    const d = JSON.parse(raw) as Draft
    if (d?.ritualNight !== night) return empty(night)     // 过夜作废
    return {
      ritualNight: night,
      gratitudes: Array.isArray(d.gratitudes) ? d.gratitudes : [],
      plans: Array.isArray(d.plans) ? d.plans : [],
      resistanceReason: typeof d.resistanceReason === 'string' ? d.resistanceReason : null,
      step: STEPS.includes(d.step) ? d.step : 'resistance',
    }
  } catch {
    return empty(night)          // 坏数据不得让页面打不开
  }
}

export function saveDraft(d: Draft): void {
  Taro.setStorageSync(KEY, JSON.stringify(d))
}

export function clearDraft(): void {
  Taro.removeStorageSync(KEY)
}
