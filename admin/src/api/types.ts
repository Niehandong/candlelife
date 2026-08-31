/**
 * 后台的 API 类型。
 *
 * ★ 刻意与 miniprogram/ 完全独立，不共享任何文件。代价是可能漂移，
 * 由 src/api/__tests__/contract.test.ts 与后端 /openapi.json 逐字段比对来兜。
 * 收益是两个前端零耦合——改小程序不会碰到后台，反之亦然。
 *
 * 字段名与后端的 snake_case 保持一致，不在这一层做 camelCase 转换：
 * 多一层映射就多一处可能漂移的地方，而契约测试只能比对到映射之前。
 */

export interface AppSection {
  name: string
  slogan: string
  home_question: string
  skip_tonight_enabled: boolean
  onboarding_enabled: boolean
  reduce_motion_default: boolean
  anonymous_analytics_enabled: boolean
}

export interface ScheduleSection {
  bedtime: string        // "HH:MM"
  wake_time: string
  min_time: string
  max_time: string
}

export interface OnboardingSection {
  welcome_title: string
  guest_copy: string
  guide_rest: string
  guide_light: string
  guide_gift: string
  story_video_path: string
  story_poster: string
  story_status: string
  skip_story_enabled: boolean
}

export interface RitualSection {
  tolerance_minutes: number
  gratitude_count: number
  plan_count: number
  resistance_options: string[]
  ritual_minutes: number
  dim_minutes: number
  goodnight_text: string
  interrupt_text: string
  resistance_reply: string
  stage_not_started_enabled: boolean
  stage_wind_down_enabled: boolean
  stage_quieting_enabled: boolean
  stage_done_enabled: boolean
}

export interface RecordsSection {
  journal_days: number
  journal_empty_copy: string
  comparison_copy: string
  collection_limit: number
  reward_timing: 'next-day' | 'immediate'
  reward_copy: string
  collection_empty_copy: string
  random_art_enabled: boolean
  image_fallback_enabled: boolean
}

export interface AdminConfig {
  app: AppSection
  schedule: ScheduleSection
  onboarding: OnboardingSection
  ritual: RitualSection
  records: RecordsSection
}

export type ConfigGroup = keyof AdminConfig

export interface AdminConfigResponse {
  config: AdminConfig
  updated_by: string | null
  updated_at: string | null
}

export interface ConfigChange {
  path: string
  from: unknown
  to: unknown
}

export interface ConfigFieldError {
  field: string
  message: string
}

export interface ConfigDiff {
  changes: ConfigChange[]
  valid: boolean
  errors: ConfigFieldError[]
}

export type ArtStatus = 'active' | 'inactive' | 'withdrawn'

export interface ArtItem {
  id: string
  title: string
  artist: string
  year: string
  thumbnail: string
  image: string
  alt: string
  source: string
  article: string
  is_active: boolean
  is_withdrawn: boolean
  status: ArtStatus
  thumbnail_url: string
  image_url: string
  reward_count: number
}

export interface ArtListResponse {
  items: ArtItem[]
  total: number          // 符合筛选条件的总数，不是本页条数
  page: number           // 当前页码，从 1 开始
  page_size: number
  pages: number          // 总页数；total 为 0 时是 0
}

export type ArtCreate = Pick<
  ArtItem,
  'id' | 'title' | 'artist' | 'year' | 'thumbnail' | 'image' | 'alt' | 'source' | 'article'
>

export type ArtUpdate = Partial<Omit<ArtCreate, 'id'>> & {
  is_active?: boolean
  is_withdrawn?: boolean
}

export interface AdminMe {
  username: string
  last_login_at: string | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}
