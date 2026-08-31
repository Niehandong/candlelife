import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../..')

describe('两端契约一致', () => {
  it('契约文件只有一份，两端都指向它', () => {
    expect(fs.existsSync(path.join(ROOT, 'shared', 'ritual-cases.json'))).toBe(true)

    const pyTest = fs.readFileSync(
      path.join(ROOT, 'backend', 'tests', 'test_domain_contract.py'), 'utf8')
    expect(pyTest).toContain('ritual-cases.json')

    const tsTest = fs.readFileSync(
      path.join(ROOT, 'miniprogram', 'src', 'domain', '__tests__', 'ritual.contract.test.ts'),
      'utf8')
    expect(tsTest).toContain('@shared/ritual-cases.json')
  })

  it('契约文件的用例数与两端读取到的一致', () => {
    const cases = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'ritual-cases.json'), 'utf8'))
    const groups = Object.entries(cases).filter(([, v]) => Array.isArray(v)) as [string, unknown[]][]
    const total = groups.reduce((sum, [, list]) => sum + list.length, 0)
    // 契约用例总数应与本文件顶部记录的期望一致（55 条，6 组）。
    // 若此断言失败：说明有人改动了 shared/ritual-cases.json 但没有同步更新
    // 两端的 contract 测试，需要人工核对新增/删减的用例是否两端都覆盖到。
    expect(total).toBe(55)
    expect(groups.length).toBe(6)
  })

  it('两端的常量一致', () => {
    const py = fs.readFileSync(path.join(ROOT, 'backend', 'app', 'domain', 'ritual.py'), 'utf8')
    const ts = fs.readFileSync(
      path.join(ROOT, 'miniprogram', 'src', 'domain', 'ritual.ts'), 'utf8')

    for (const [name, value] of [
      ['RITUAL_NIGHT_BOUNDARY_HOUR', '6'],
      ['REVEAL_HOUR', '6'],
      ['BASE_DOUBLE_STREAK', '14'],
    ] as const) {
      expect(py, `Python 缺 ${name}`).toMatch(new RegExp(`${name}\\s*[:=].*${value}`))
      expect(ts, `TS 缺 ${name}`).toMatch(new RegExp(`${name}\\s*=\\s*${value}`))
    }
  })

  it('端上覆盖 spec 第六节的全部接口', () => {
    // /api/v1/auth/refresh 不在 endpoints.ts 的公开 api 对象里 —— 它是
    // client.ts 里 401 时自动触发的内部刷新逻辑，不该被业务代码直接调用。
    // 因此这里合并两个文件的内容一起检查，而不是只查 endpoints.ts。
    const endpoints = fs.readFileSync(
      path.join(ROOT, 'miniprogram', 'src', 'api', 'endpoints.ts'), 'utf8')
    const client = fs.readFileSync(
      path.join(ROOT, 'miniprogram', 'src', 'api', 'client.ts'), 'utf8')
    const combined = endpoints + '\n' + client
    for (const p of [
      '/api/v1/auth/wx-login', '/api/v1/auth/refresh', '/api/v1/me',
      '/api/v1/me/settings', '/api/v1/nights/complete', '/api/v1/nights',
      '/api/v1/rewards/pending', '/api/v1/rewards/reveal', '/api/v1/collection',
      '/api/v1/config', '/api/v1/events',
    ]) {
      expect(combined, `缺接口 ${p}`).toContain(p)
    }
  })

  it('端上不硬编码域名（生产源码，不含测试夹具）', () => {
    const src = path.join(ROOT, 'miniprogram', 'src')
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.isDirectory()) {
          // 测试夹具目录里常用 example.com 之类占位域名，不属于生产代码，跳过。
          if (e.name === '__tests__') return []
          return walk(path.join(dir, e.name))
        }
        if (!/\.tsx?$/.test(e.name)) return []
        if (/\.test\.tsx?$/.test(e.name)) return []
        return [path.join(dir, e.name)]
      })
    for (const file of walk(src)) {
      const code = fs.readFileSync(file, 'utf8')
      expect(code, `${file} 硬编码了域名`).not.toMatch(/https?:\/\/(?!localhost)[a-z0-9.-]+\.(com|cn|net)/i)
    }
  })
})
