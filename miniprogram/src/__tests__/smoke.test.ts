import { describe, expect, it } from 'vitest'

describe('工程配置', () => {
  it('可以解析 @shared 别名下的契约文件', async () => {
    const cases = (await import('@shared/ritual-cases.json')).default as Record<string, unknown>
    expect(Object.keys(cases)).toContain('evaluate_completion')
    expect(Object.keys(cases)).toContain('reward_draw_count')
  })

  it('契约用例数量与后端一致', async () => {
    const cases = (await import('@shared/ritual-cases.json')).default as unknown as Record<string, unknown[]>
    const total = Object.entries(cases)
      .filter(([k]) => k !== '_comment')
      .reduce((n, [, v]) => n + v.length, 0)
    expect(total).toBeGreaterThanOrEqual(46)
  })
})
