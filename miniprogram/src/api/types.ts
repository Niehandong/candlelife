export type SettingsPayload = {
  bedtime: string        // HH:MM
  wake_time: string
  timezone: string
  reduced_motion: boolean
}

export type MeResponse = {
  id: string
  nickname: string | null
  avatar_url: string | null
  settings: SettingsPayload
}

export type CompleteRequest = {
  completed_at: string   // 带时区偏移的 ISO
  gratitudes: string[]
  plans: string[]
  resistance_reason?: string | null
}

export type CompleteResponse = {
  ritual_date: string
  is_eligible: boolean
  late_minutes: number
  streak: number
}

export type NightSummary = {
  ritual_date: string
  is_eligible: boolean
  late_minutes: number
  completed_at: string
}

export type NightDetail = NightSummary & {
  gratitudes: string[]
  plans: string[]
  resistance_reason: string | null
  text_available: boolean
}

export type ArtBrief = {
  id: string; title: string; artist: string; year: string
  thumbnail: string; image: string; alt: string
}

export type ArtDetail = ArtBrief & { source: string; article: string }

export type RewardItem = { art: ArtBrief; ritual_date: string; awarded_at: string }
export type PendingResponse = { revealable: boolean; ritual_dates: string[] }
export type CollectionItem = { art: ArtBrief; count: number }
export type CollectionResponse = {
  total_cards: number; unique_works: number; items: CollectionItem[]
}

export type ConfigResponse = {
  schedule: { bedtime: string; wake_time: string; min_time: string; max_time: string }
  ritual: {
    tolerance_minutes: number; gratitude_count: number
    plan_count: number; resistance_options: string[]
  }
  assets: { base_url: string }
}

export type EventItem = { type: string; payload: Record<string, unknown>; occurred_at: string }
