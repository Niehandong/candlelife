import type { ConfigChange } from '../api/types'

/**
 * 配置字段路径 → 中文标签。
 *
 * 单行覆盖不可回滚，用户已知情并选择了这个方案。这张表是那个决策的主要防线：
 * 42 个字段的表单，最大的风险不是不能回滚，而是改了自己没意识到改了什么。
 * 所以 diff 必须用管理员在表单上看到的那个中文标签，不能直接甩出英文路径。
 */
const LABELS: Record<string, string> = {
  'app.name': '小程序名称',
  'app.slogan': '一句话定位',
  'app.home_question': '首页核心问题',
  'app.skip_tonight_enabled': '允许跳过今晚',
  'app.onboarding_enabled': '首次使用显示引导',
  'app.reduce_motion_default': '减少动态效果选项',
  'app.anonymous_analytics_enabled': '允许匿名事件统计',
  'schedule.bedtime': '默认就寝时间',
  'schedule.wake_time': '默认起床时间',
  'schedule.min_time': '可选最早就寝时间',
  'schedule.max_time': '可选最晚就寝时间',
  'onboarding.welcome_title': '欢迎页标题',
  'onboarding.guest_copy': '游客说明',
  'onboarding.guide_rest': '第一幕',
  'onboarding.guide_light': '第二幕',
  'onboarding.guide_gift': '第三幕',
  'onboarding.story_video_path': '视频资源路径',
  'onboarding.story_poster': '封面资源',
  'onboarding.story_status': '播放提示',
  'onboarding.skip_story_enabled': '允许跳过序章',
  'ritual.tolerance_minutes': '按时完成容差（分钟）',
  'ritual.gratitude_count': '感恩输入数量',
  'ritual.plan_count': '明日计划数量',
  'ritual.resistance_options': '晚间阻力选项',
  'ritual.ritual_minutes': '默认仪式时长（分钟）',
  'ritual.dim_minutes': '提前变暗（分钟）',
  'ritual.goodnight_text': '完成文案',
  'ritual.interrupt_text': '中断后的温柔提醒',
  'ritual.resistance_reply': '默认温柔回应',
  'ritual.stage_not_started_enabled': '阶段一 · 未开始',
  'ritual.stage_wind_down_enabled': '阶段二 · 准备入睡',
  'ritual.stage_quieting_enabled': '阶段三 · 即将入睡',
  'ritual.stage_done_enabled': '阶段四 · 已完成',
  'records.journal_days': '默认展示最近天数',
  'records.journal_empty_copy': '夜记空状态',
  'records.comparison_copy': '比较反馈模板',
  'records.collection_limit': '收藏总数量',
  'records.reward_timing': '奖励出现时间',
  'records.reward_copy': '次日奖励文案',
  'records.collection_empty_copy': '收藏空状态',
  'records.random_art_enabled': '名画随机解锁',
  'records.image_fallback_enabled': '图片加载失败显示统一占位',
}

// 这些字段改了会立刻改变用户可见的判定结果，值得单独警告一句
const HIGH_IMPACT = new Set([
  'ritual.tolerance_minutes',
  'schedule.min_time',
  'schedule.max_time',
])

function show(value: unknown): string {
  if (value === null || value === undefined) return '（空）'
  if (typeof value === 'boolean') return value ? '开' : '关'
  if (Array.isArray(value)) return value.join('、')
  return String(value)
}

export default function DiffTable({ changes }: { changes: ConfigChange[] }) {
  if (changes.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>没有改动</p>
  }

  const risky = changes.filter((c) => HIGH_IMPACT.has(c.path))

  return (
    <div>
      {risky.length > 0 && (
        <p role="alert" style={{
          background: 'var(--warn-bg)', color: 'var(--warn)',
          padding: '10px 14px', borderRadius: 10, marginTop: 0,
        }}>
          这次改动会影响按时判定。今晚起生效，
          <strong>历史夜记不会被修正</strong>——已经写进去的资格与迟到分钟是固化的。
        </p>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
            <th style={{ padding: '8px 0' }}>字段</th>
            <th>现在</th>
            <th>改成</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.path} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 0' }}>{LABELS[c.path] ?? c.path}</td>
              <td style={{ color: 'var(--muted)' }}>{show(c.from)}</td>
              <td style={{ color: 'var(--primary-deep)' }}>{show(c.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { LABELS as FIELD_LABELS }
