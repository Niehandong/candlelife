import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = fs.readFileSync(path.resolve(__dirname, '../ritual.ts'), 'utf8')
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('domain 纯度', () => {
  it('不 import 任何运行时依赖', () => {
    const imports = [...CODE.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
    for (const i of imports) {
      expect(i.startsWith('@tarojs'), `不得依赖 ${i}`).toBe(false)
      expect(i.includes('/api/'), `不得依赖 ${i}`).toBe(false)
      expect(i.includes('/store/'), `不得依赖 ${i}`).toBe(false)
    }
  })

  it('不读取当前时刻', () => {
    // 当前时刻必须由调用方传入，否则无法测试且会引入设备时区依赖
    expect(CODE).not.toMatch(/Date\.now\(\)/)
    // 无参 new Date()，以及等价的无括号写法 new Date（两者都取设备当前时刻）
    expect(CODE).not.toMatch(/new\s+Date\s*\(\s*\)/)
    expect(CODE).not.toMatch(/new\s+Date\b(?!\s*\()/)
  })

  it('不使用 Date 的本地时区访问器', () => {
    // getHours/getMonth 等读的是设备本地时区，会让判定结果随手机时区漂移。
    // getTime/getUTC* 不受影响，允许使用。
    const localAccessors =
      /\.(getHours|getMinutes|getSeconds|getMilliseconds|getDate|getMonth|getFullYear|getDay|getYear)\s*\(/
    expect(CODE).not.toMatch(localAccessors)
  })
})
