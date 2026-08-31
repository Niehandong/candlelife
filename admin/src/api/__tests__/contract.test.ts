import { describe, expect, it } from 'vitest'

/**
 * 与后端 OpenAPI 逐字段比对。
 *
 * 「类型完全独立」是用户的决策（两个前端零耦合），代价是 types.ts 可能与后端漂移。
 * 这条测试就是那个代价的对冲：后端改字段名 → 这里红。
 *
 * 需要后端在 127.0.0.1:8010 跑着。没跑时 skip 而非 fail——让 npm test 在没有
 * 后端的机器上永远红，只会训练开发者忽略红色。发布前必须起着后端跑一次，
 * VERIFY.md 有这一条。
 */

const BACKEND = process.env.BACKEND_URL ?? 'http://127.0.0.1:8010'

interface Schema {
  properties?: Record<string, { enum?: string[] }>
  required?: string[]
}

type Spec = {
  paths: Record<string, unknown>
  components: { schemas: Record<string, Schema> }
}

/* 顶层 await，不是 beforeAll。
   it.skipIf(...) 在【收集阶段】求值，那时 beforeAll 还没跑——用 beforeAll 取 spec
   会让 skipIf 永远看到 null，这 11 条断言就永远 skip：一个从不执行的假测试，
   而它是防类型漂移的唯一机制。曾经真的这么写错过一次。 */
const spec: Spec | null = await (async () => {
  try {
    const res = await fetch(`${BACKEND}/openapi.json`)
    return res.ok ? ((await res.json()) as Spec) : null
  } catch {
    return null
  }
})()

const props = (name: string): string[] => {
  const schema = spec!.components.schemas[name]
  expect(schema, `后端没有 schema ${name}`).toBeDefined()
  return Object.keys(schema!.properties ?? {}).sort()
}

describe('与后端 OpenAPI 的契约', () => {
  it.skipIf(!spec)('后端暴露了全部 admin 路径', () => {
    const expected = [
      '/api/v1/admin/login',
      '/api/v1/admin/me',
      '/api/v1/admin/config',
      '/api/v1/admin/config/export',
      '/api/v1/admin/art',
      '/api/v1/admin/art/{art_id}',
    ]
    for (const path of expected) {
      expect(Object.keys(spec!.paths)).toContain(path)
    }
  })

  it.skipIf(!spec)('AppSection 的字段与 types.ts 一致', () => {
    expect(props('AppSection')).toEqual([
      'anonymous_analytics_enabled', 'home_question', 'name',
      'onboarding_enabled', 'reduce_motion_default', 'skip_tonight_enabled', 'slogan',
    ])
  })

  it.skipIf(!spec)('ScheduleSection 的字段一致', () => {
    expect(props('ScheduleSection')).toEqual(
      ['bedtime', 'max_time', 'min_time', 'wake_time'])
  })

  it.skipIf(!spec)('OnboardingSection 的字段一致', () => {
    expect(props('OnboardingSection')).toEqual([
      'guest_copy', 'guide_gift', 'guide_light', 'guide_rest',
      'skip_story_enabled', 'story_poster', 'story_status', 'story_video_path',
      'welcome_title',
    ])
  })

  it.skipIf(!spec)('RitualSection 的字段一致', () => {
    expect(props('RitualSection')).toEqual([
      'dim_minutes', 'goodnight_text', 'gratitude_count', 'interrupt_text',
      'plan_count', 'resistance_options', 'resistance_reply', 'ritual_minutes',
      'stage_done_enabled', 'stage_not_started_enabled', 'stage_quieting_enabled',
      'stage_wind_down_enabled', 'tolerance_minutes',
    ])
  })

  it.skipIf(!spec)('RecordsSection 的字段一致', () => {
    expect(props('RecordsSection')).toEqual([
      'collection_empty_copy', 'collection_limit', 'comparison_copy',
      'image_fallback_enabled', 'journal_days', 'journal_empty_copy',
      'random_art_enabled', 'reward_copy', 'reward_timing',
    ])
  })

  it.skipIf(!spec)('AdminArtItem 的字段与 ArtItem 一致', () => {
    expect(props('AdminArtItem')).toEqual([
      'alt', 'article', 'artist', 'id', 'image', 'image_url', 'is_active',
      'is_withdrawn', 'reward_count', 'source', 'status', 'thumbnail',
      'thumbnail_url', 'title', 'year',
    ])
  })

  it.skipIf(!spec)('AdminArtListResponse 带分页字段', () => {
    expect(props('AdminArtListResponse')).toEqual(
      ['items', 'page', 'page_size', 'pages', 'total'])
  })

  it.skipIf(!spec)('作品列表接口接受分页参数', () => {
    const get = (spec!.paths['/api/v1/admin/art'] as {
      get: { parameters?: { name: string }[] }
    }).get
    const names = (get.parameters ?? []).map((p) => p.name).sort()
    expect(names).toEqual(['page', 'page_size', 'q', 'status'])
  })

  it.skipIf(!spec)('AdminMeResponse 的字段一致', () => {
    expect(props('AdminMeResponse')).toEqual(['last_login_at', 'username'])
  })

  it.skipIf(!spec)('ConfigChangeItem 用 from/to 而不是 old/new', () => {
    expect(props('ConfigChangeItem')).toEqual(['from', 'path', 'to'])
  })

  it.skipIf(!spec)('reward_timing 只有两个合法值', () => {
    const schema = spec!.components.schemas['RecordsSection']!
    expect(schema.properties!['reward_timing']?.enum?.slice().sort())
      .toEqual(['immediate', 'next-day'])
  })

  it.skipIf(!spec)('admin 路径里没有任何用户数据接口', () => {
    const adminPaths = Object.keys(spec!.paths).filter((p) => p.includes('/admin'))
    expect(adminPaths.length).toBeGreaterThan(0)
    for (const path of adminPaths) {
      expect(path.toLowerCase()).not.toMatch(/user|night|record|journal|event/)
    }
  })

  /* 哨兵：这一条永不 skip。
     它守的是「skipIf 是否真的反映了后端状态」——曾经因为在 beforeAll 里取 spec，
     skipIf 在收集阶段永远看到 null，上面 11 条断言从不执行，而测试报告显示
     「1 passed | 11 skipped」，看起来像后端没起，实际是永远跳过。
     后端可达却 spec 为 null，就是那个 bug 回来了。 */
  it('后端可达时，上面的契约断言必须真的执行过而不是被静默跳过', async () => {
    let reachable = false
    try {
      reachable = (await fetch(`${BACKEND}/openapi.json`)).ok
    } catch {
      reachable = false
    }

    if (!reachable) {
      console.warn(
        `\n⚠️  后端未运行（${BACKEND}），契约断言已跳过。\n` +
        '   发布前必须起着后端跑一次：\n' +
        '   ./.venv/bin/python backend/main.py\n',
      )
      return
    }

    expect(spec, '后端可达但 spec 为 null —— 契约断言正在被静默跳过').not.toBeNull()
  })
})
