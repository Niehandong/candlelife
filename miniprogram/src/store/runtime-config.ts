import Taro from '@tarojs/taro'
import type { ConfigResponse } from '@/api/types'

const KEY = 'zhusheng-config-v1'

/** 拿不到 /config 时的兜底，数值与后端 domain/config.py 保持一致。 */
export const DEFAULT_CONFIG: ConfigResponse = {
  schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
  ritual: {
    tolerance_minutes: 30, gratitude_count: 3, plan_count: 3,
    resistance_options: ['我还在刷手机', '我还在工作', '我还不困', '我舍不得结束今天'],
  },
  assets: { base_url: '' },
}

function isValidConfig(c: unknown): c is ConfigResponse {
  const x = c as ConfigResponse | null
  if (!x || typeof x !== 'object') return false

  const s = x.schedule
  if (!s || typeof s.bedtime !== 'string' || typeof s.wake_time !== 'string'
    || typeof s.min_time !== 'string' || typeof s.max_time !== 'string') return false

  const r = x.ritual
  if (!r || typeof r.tolerance_minutes !== 'number'
    || typeof r.gratitude_count !== 'number' || typeof r.plan_count !== 'number'
    || !Array.isArray(r.resistance_options)) return false

  // base_url 允许是空字符串（DEFAULT_CONFIG 就是空的），但必须是字符串
  if (!x.assets || typeof x.assets.base_url !== 'string') return false

  return true
}

export function loadConfig(): ConfigResponse | null {
  try {
    const raw = Taro.getStorageSync(KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    // 浅校验不够：顶层字段都在、内层子字段缺失同样会让下游崩溃或静默失效。
    // Task 8 会 .map() resistance_options，Task 6/7/8/9 会用 assets.base_url 拼 URL。
    return isValidConfig(c) ? c : null
  } catch {
    return null
  }
}

export function saveConfig(c: ConfigResponse): void {
  Taro.setStorageSync(KEY, JSON.stringify(c))
}
