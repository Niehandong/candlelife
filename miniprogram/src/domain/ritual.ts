import type { CollectionSummary, CompletionAssessment } from './types'

export const RITUAL_NIGHT_BOUNDARY_HOUR = 6
export const REVEAL_HOUR = 6
export const BASE_DOUBLE_STREAK = 14

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** 取某时刻在指定时区的墙钟读数。不依赖设备本地时区。 */
function wallClock(instant: Date, tz: string): Wall {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const { type, value } of fmt.formatToParts(instant)) p[type] = value
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour === '24' ? '0' : p.hour),
    minute: Number(p.minute), second: Number(p.second),
  }
}

/** 目标时区在该时刻的 UTC 偏移（分钟）。 */
function offsetMinutes(instant: Date, tz: string): number {
  const w = wallClock(instant, tz)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return Math.round((asUtc - instant.getTime()) / 60000)
}

/** 把目标时区的墙钟时间还原为真实时刻。 */
function fromWallClock(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  const off1 = offsetMinutes(guess, tz)
  const first = new Date(guess.getTime() - off1 * 60000)
  const off2 = offsetMinutes(first, tz)
  if (off2 === off1) return first

  // 偏移在这个时刻附近发生了变化（DST 切换）。回读校验哪个候选真的对得上请求的墙钟时间。
  const second = new Date(guess.getTime() - off2 * 60000)
  const w = wallClock(second, tz)
  if (w.hour === hh && w.minute === mm) return second

  // 两个都对不上 = 该本地时间在跳变缺口中不存在。
  // 与后端 Python 的 fold=0 语义一致：采用跳变前的偏移。
  return first
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateKey = (w: Wall) => `${w.year}-${pad(w.month)}-${pad(w.day)}`

function parseTime(hhmm: string): [number, number] {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) throw new Error(`时间格式必须为 HH:MM，收到 ${hhmm}`)
  return [Number(m[1]), Number(m[2])]
}

function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number]
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** 把「日期 + 时:分」编码为线性分钟数，供墙钟（naive）比较用——不代入任何时区偏移。 */
function naiveMinutes(dk: string, hour: number, minute: number): number {
  const [y, m, d] = dk.split('-').map(Number) as [number, number, number]
  return Math.round(Date.UTC(y, m - 1, d, hour, minute) / 60000)
}

/** 此刻所处的仪式夜。凌晨 6 点前算前一晚。 */
export function currentRitualNight(now: Date, tz: string): string {
  return dateKey(wallClock(new Date(now.getTime() - RITUAL_NIGHT_BOUNDARY_HOUR * 3600000), tz))
}

function inEligibilityWindow(hh: number, mm: number, minTime: string, maxTime: string): boolean {
  const t = hh * 60 + mm
  const [minH, minM] = parseTime(minTime)
  const [maxH, maxM] = parseTime(maxTime)
  const lo = minH * 60 + minM
  const hi = maxH * 60 + maxM
  return lo <= hi ? t >= lo && t <= hi : t >= lo || t <= hi   // 窗口可跨午夜
}

export function evaluateCompletion(input: {
  plannedTime: string; completedAt: Date; tz: string
  toleranceMinutes: number; minTime: string; maxTime: string
}): CompletionAssessment {
  const { plannedTime, completedAt, tz, toleranceMinutes, minTime, maxTime } = input
  const w = wallClock(completedAt, tz)
  const [ph, pm] = parseTime(plannedTime)
  const base = dateKey(w)
  const completedNaive = naiveMinutes(base, w.hour, w.minute)

  // 在前一天/当天/次日三个候选中取「墙钟读数」距完成时刻最近的计划时刻。
  //
  // 刻意用墙钟（naive）分钟数比较，而非真实时刻（epoch ms）比较——这是为了
  // 与后端 Python 权威实现在 DST 切换夜的行为对齐：Python 的 ZoneInfo 按 key
  // 缓存，同一时区字符串在同一次调用内解析出的是同一个 tzinfo 对象；当两个
  // datetime 共享同一个 tzinfo 实例时，CPython 的减法/比较会走「相同 tzinfo
  // 则按裸值（naive）比较」的捷径，等价于直接比较墙钟读数、不做真实物理时长
  // 换算。平时（不跨 DST 边界）两种算法结果相同，只有在计划时刻与完成时刻横跨
  // DST 切换点时才会分叉，此时必须复刻这一效果才能保持两端契约一致。
  let bestDelta = Infinity
  let bestCandidateDate = base
  for (const off of [-1, 0, 1]) {
    const candidateDate = shiftDateKey(base, off)
    const candidateNaive = naiveMinutes(candidateDate, ph, pm)
    const delta = completedNaive - candidateNaive
    if (Math.abs(delta) < Math.abs(bestDelta)) {
      bestDelta = delta
      bestCandidateDate = candidateDate
    }
  }

  const deltaMinutes = bestDelta
  const [py, pmo, pd] = bestCandidateDate.split('-').map(Number) as [number, number, number]
  const plannedAt = fromWallClock(py, pmo, pd, ph, pm, tz)

  // 仪式夜由计划时刻归属：凌晨 6 点前的计划属于前一晚。用「请求的」墙钟小时
  // （ph）判断，而非重新解码 plannedAt 得到的墙钟小时——因为 DST 跳变缺口中
  // 请求的墙钟时间本就不存在，解码回来的读数会和原始请求不同（对应 Python
  // 的 datetime.combine 对象始终保留调用方传入的 naive 小时字段这一点）。
  const ritualDate = ph < RITUAL_NIGHT_BOUNDARY_HOUR
    ? shiftDateKey(bestCandidateDate, -1)
    : bestCandidateDate

  return {
    ritualDate,
    plannedAt,
    completedAt,
    lateMinutes: Math.max(0, deltaMinutes),
    eligible:
      inEligibilityWindow(w.hour, w.minute, minTime, maxTime) && deltaMinutes <= toleranceMinutes,
  }
}

export function calculateOnTimeStreak(
  records: Array<[string, boolean]>, currentNight: string
): number {
  const byDate = new Map(records)
  if (byDate.size === 0) return 0
  const latest = [...byDate.keys()].sort().pop()!
  if (daysBetween(latest, currentNight) > 1) return 0   // 中间已有整夜缺席
  if (!byDate.get(latest)) return 0

  let streak = 1
  let cursor = latest
  while (byDate.get(shiftDateKey(cursor, -1))) {
    streak += 1
    cursor = shiftDateKey(cursor, -1)
  }
  return streak
}

/** 抽卡次数。基础 1 抽，连续满 14 晚后基础 2 抽；里程碑额外 +1。
 *  门槛定在 14 而非 30：定在 30 时前 37 晚故意断签仍更划算，
 *  降到 14 后交叉点提前至第 16 晚。 */
export function rewardDrawCount(streak: number): number {
  const base = streak >= BASE_DOUBLE_STREAK ? 2 : 1
  const milestone =
    streak === 3 || streak === 7 || streak === 14 || (streak >= 30 && streak % 30 === 0)
  return base + (milestone ? 1 : 0)
}

export function revealWindowOpensAt(ritualDate: string, tz: string): Date {
  const next = shiftDateKey(ritualDate, 1)
  const [y, m, d] = next.split('-').map(Number) as [number, number, number]
  return fromWallClock(y, m, d, REVEAL_HOUR, 0, tz)
}

/** 判断某个仪式夜的奖励是否已到揭晓窗口。
 *
 * 注意：小程序端当前**不调用**此函数——客户端如实转发服务端 /rewards/pending
 * 的 revealable，不自己重算边界，避免端云判断不一致。
 * 保留它是为了与 shared/ritual-cases.json 的 12 条 can_reveal 契约用例对齐：
 * 删掉会让那些用例只验 Python 侧，双端一致性的覆盖面被削弱。**请勿按「死代码」删除。**
 */
export function canReveal(input: {
  ritualDate: string; isEligible: boolean; rewardRevealedAt: Date | null; now: Date; tz: string
}): boolean {
  if (!input.isEligible || input.rewardRevealedAt !== null) return false
  return input.now.getTime() >= revealWindowOpensAt(input.ritualDate, input.tz).getTime()
}

export function summarizeCollection(artIds: string[]): CollectionSummary {
  const counts: Record<string, number> = {}
  for (const id of artIds) counts[id] = (counts[id] ?? 0) + 1
  return {
    totalCards: Object.values(counts).reduce((a, b) => a + b, 0),
    uniqueWorks: Object.keys(counts).length,
    counts,
  }
}
