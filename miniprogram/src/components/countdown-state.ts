import { evaluateCompletion } from '@/domain/ritual'

export type Phase = 'prepare' | 'near' | 'sleep'

// 与原型一致：prototype/zhusheng-app.js 用 config.ritual.dimMinutes（默认 10 分钟）
// 判定 near 相位。此处暂硬编码，后端 /config 尚未下发 dim_minutes 字段。
const NEAR_SECONDS = 10 * 60

/**
 * 复用 domain 的计划时刻解析逻辑，避免此处再写一份跨午夜规则。
 * 容差与窗口给成不影响 plannedAt 计算的值——这里只取 plannedAt，不用 eligible。
 */
export function countdownState(now: Date, bedtime: string, tz: string) {
  const { plannedAt } = evaluateCompletion({
    plannedTime: bedtime,
    completedAt: now,
    tz,
    toleranceMinutes: 0,
    minTime: '00:00',
    maxTime: '23:59',
  })
  const delta = Math.floor((plannedAt.getTime() - now.getTime()) / 1000)

  if (delta <= 0) return { seconds: 0, late: -delta, phase: 'sleep' as Phase }

  return {
    seconds: delta,
    late: 0,
    phase: (delta <= NEAR_SECONDS ? 'near' : 'prepare') as Phase,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [h, m, s].map(pad).join(' : ')
}
