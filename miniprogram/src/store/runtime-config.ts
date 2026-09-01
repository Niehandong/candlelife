import Taro from '@tarojs/taro'
import type { ConfigResponse } from '@/api/types'

const KEY = 'zhusheng-config-v1'

/**
 * 【刻意没有本地兜底常量】
 *
 * 这里原先有一份 DEFAULT_CONFIG，在拿不到 /api/v1/config 时顶上。用户决定去掉它：
 * 全部运营配置一律以后端为准，前端不再藏第二份真相 —— 否则管理员在后台改了
 * 容差或阻力选项，断网用户看到的仍是编译进包里的旧值，而且没有任何迹象表明
 * 他看到的是旧的。
 *
 * 代价是拿不到配置时页面无从渲染，由 components/ConfigGate.tsx 显式挡住。
 *
 * 顺带说明：那份兜底的 assets.base_url 本来就是空字符串，
 * 所以「用兜底渲染背景图」拼出来的一直是 /ui/xxx.jpg 这种坏 URL，
 * 对图片类页面它从来没真正起过作用。
 */

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

  // base_url 必须是字符串。允许为空 —— 后端未配置对象存储时可能就是空的，
  // 那种情况下图片取不到，但配置本身仍然有效。
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


/**
 * 图片资源的 base_url，拿不到配置时返回 undefined。
 *
 * 给 <Screen background> 用：传 undefined 就是「不设背景」，
 * 而不是拼出一个 `/ui/home-room.jpg` 这样的半截 URL 去发一次注定 404 的请求。
 */
export function assetBase(): string | undefined {
  return loadConfig()?.assets.base_url || undefined
}
