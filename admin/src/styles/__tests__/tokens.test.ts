import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 设计令牌必须与原型逐字一致。
 *
 * 阶段一在小程序端出过一次事故：计划里写着「令牌取自原型的 CSS 变量」，
 * 但那五个十六进制值在原型里一次都没出现过——是编的。这条测试让「取自原型」
 * 这句话变成可执行的断言。
 */
const PROTOTYPE = resolve(__dirname, '../../../../prototype/zhusheng-admin.html')
const TOKENS = resolve(__dirname, '../tokens.css')

// 从 prototype/zhusheng-admin.html 的 :root 逐字抄下
const EXPECTED: Record<string, string> = {
  '--bg': '#f7f6f8',
  '--surface': '#fffdfb',
  '--soft': '#f1eef3',
  '--primary-soft': '#eee8f2',
  '--ink': '#594e5f',
  '--muted': '#716575',
  '--primary': '#806890',
  '--primary-deep': '#675472',
  '--border': '#e5dfe5',
  '--success': '#526f59',
  '--success-bg': '#eaf0e9',
  '--warn': '#80613d',
  '--warn-bg': '#f5ecdf',
  '--danger': '#95536a',
}

describe('设计令牌', () => {
  const prototype = readFileSync(PROTOTYPE, 'utf-8')
  const tokens = readFileSync(TOKENS, 'utf-8')

  it.each(Object.entries(EXPECTED))('%s 出现在原型里', (name, value) => {
    expect(prototype).toContain(`${name}:${value}`)
  })

  it.each(Object.entries(EXPECTED))('%s 在 tokens.css 里取同一个值', (name, value) => {
    expect(tokens).toMatch(new RegExp(`${name}\\s*:\\s*${value}\\s*;`))
  })

  it('没有遗漏原型里的任何一个颜色令牌', () => {
    const inPrototype = [...prototype.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8})/gi)]
      .map((m) => m[1])
    const unique = [...new Set(inPrototype)]
    expect(unique.sort()).toEqual(Object.keys(EXPECTED).sort())
  })
})
