import Taro from '@tarojs/taro'
import { api } from '@/api/endpoints'
import type { EventItem } from '@/api/types'
import { toIsoWithOffset } from './time'

const KEY = 'zhusheng-events-v1'
const MAX = 200          // 与后端 EventBatch 的上限一致

/** 绝不可进入匿名事件的字段。后端 schema 层也会拒收，此处是第一道闸。 */
const FORBIDDEN = new Set([
  'gratitudes', 'plans', 'openid', 'session_key', 'nickname', 'avatar_url',
  'text', 'content', 'access_token', 'refresh_token',
])

function scrub(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) if (!FORBIDDEN.has(k)) out[k] = v
  return out
}

function read(): EventItem[] {
  try {
    const raw = Taro.getStorageSync(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const write = (xs: EventItem[]) => Taro.setStorageSync(KEY, JSON.stringify(xs.slice(-MAX)))

export function queueEvent(type: string, payload: Record<string, unknown> = {}): void {
  write([...read(), { type, payload: scrub(payload), occurred_at: toIsoWithOffset(new Date()) }])
}

export async function flushEvents(): Promise<void> {
  const events = read()
  if (events.length === 0) return
  try {
    await api.postEvents(events)
    Taro.removeStorageSync(KEY)
  } catch {
    // 保留队列，下次启动再试。事件丢失不影响业务正确性。
  }
}
