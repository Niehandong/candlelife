import type { AdminConfig } from '../../../api/types'

/** 一份完整的默认配置。与后端 domain/config.py 的 DEFAULT_CONFIG 对应。 */
export const CONFIG_FIXTURE: AdminConfig = {
  app: {
    name: '烛生',
    slogan: '陪你按时睡觉',
    home_question: '今晚，几点睡？',
    skip_tonight_enabled: true,
    onboarding_enabled: true,
    reduce_motion_default: true,
    anonymous_analytics_enabled: false,
  },
  schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
  onboarding: {
    welcome_title: '让今晚，轻一点。',
    guest_copy: '无需登录，记录仅保存在这台设备。',
    guide_rest: '把今天放在门外',
    guide_light: '为自己留一盏小灯',
    guide_gift: '明早，收下一份安静的礼物',
    story_video_path: 'story/zhusheng-prologue.mp4',
    story_poster: 'story/01-enter-bedroom.png',
    story_status: '让这段故事，带你慢慢安静下来。',
    skip_story_enabled: true,
  },
  ritual: {
    tolerance_minutes: 30,
    gratitude_count: 3,
    plan_count: 3,
    resistance_options: ['我还在刷手机'],
    ritual_minutes: 30,
    dim_minutes: 10,
    goodnight_text: '今天已经好好结束了。晚安。',
    interrupt_text: '不用责怪自己。',
    resistance_reply: '把手机放远一点。',
    stage_not_started_enabled: true,
    stage_wind_down_enabled: true,
    stage_quieting_enabled: true,
    stage_done_enabled: true,
  },
  records: {
    journal_days: 30,
    journal_empty_copy: '空',
    comparison_copy: '早了 {minutes} 分钟。',
    collection_limit: 100,
    reward_timing: 'next-day',
    reward_copy: '礼物',
    collection_empty_copy: '空',
    random_art_enabled: true,
    image_fallback_enabled: true,
  },
}

export const cloneFixture = (): AdminConfig =>
  JSON.parse(JSON.stringify(CONFIG_FIXTURE)) as AdminConfig
