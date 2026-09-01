import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 导入 runtime-config 会拉进 Taro 运行时（它要 ENABLE_INNER_HTML 这类编译期常量），
// 与 draft.test.ts 一样先把 Taro 换成最小替身。
let storage: Record<string, any> = {}
vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync: (k: string) => storage[k] ?? '',
    setStorageSync: (k: string, v: any) => { storage[k] = v },
    removeStorageSync: (k: string) => { delete storage[k] },
  },
}))

beforeEach(() => { storage = {} })

const SRC = path.resolve(__dirname, '../..')

/**
 * 配置一律以后端为准，前端不许再藏第二份真相。
 *
 * 【为什么值得守】曾经有一份 DEFAULT_CONFIG 在拿不到 /api/v1/config 时顶上。
 * 问题不在于它是「假数据」，而在于它是**沉默的旧数据**：管理员在后台把容差从
 * 30 改成 15，断网用户看到的仍是编译进包里的 30，而且界面上没有任何迹象
 * 表明他看到的是旧值。这比明确报错糟得多。
 *
 * 用户决定去掉它。这条测试防止它以别的名字长回来。
 */

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(full)
    return /\.tsx?$/.test(e.name) ? [full] : []
  })
}

describe('前端不藏配置兜底', () => {
  it('业务代码里没有本地的配置默认值', () => {
    // 只查【导出的】常量：局部变量叫 defaultX 不要紧，
    // 会被别处引用的导出常量才是第二份真相。
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const m of text.matchAll(/export\s+const\s+(\w*(?:DEFAULT|FALLBACK)\w*)/gi)) {
        const name = m[1]!
        // FALLBACK_MESSAGE 是错误提示文案，不是配置值 —— 放行
        if (/MESSAGE|TEXT|COPY/i.test(name)) continue
        offenders.push(`${path.relative(SRC, file)}: ${name}`)
      }
    }
    expect(offenders, '这些导出常量看起来是配置兜底，配置应当只来自后端').toEqual([])
  })

  it('runtime-config 只提供读缓存的接口，不提供默认配置', async () => {
    const mod = await import('../runtime-config')
    expect(Object.keys(mod).sort()).toEqual(['assetBase', 'loadConfig', 'saveConfig'])
  })

  it('拿不到配置时 loadConfig 返回 null 而不是一份默认值', async () => {
    const { loadConfig } = await import('../runtime-config')
    expect(loadConfig()).toBeNull()
  })
})
