import { describe, expect, it } from 'vitest'
import { TAB_ORDER, tabIconSet } from '../icons'

describe('tabBar 配色', () => {
  it('四个 tab 顺序与原型一致', () => {
    expect(TAB_ORDER).toEqual(['home', 'journal', 'collection', 'settings'])
  })

  it('当前 tab 用选中态图标', () => {
    for (const key of TAB_ORDER) {
      expect(tabIconSet(key)[key]).toContain(`${key}-on`)
    }
  })

  it('首页用深色配色（原型 home 页导航为深色）', () => {
    const set = tabIconSet('home')
    expect(set.journal).toContain('journal-off-dark')
    expect(set.collection).toContain('collection-off-dark')
    expect(set.settings).toContain('settings-off-dark')
  })

  it('收藏页与设置页各用自己的配色变体', () => {
    expect(tabIconSet('collection').home).toContain('home-off-c')
    expect(tabIconSet('settings').home).toContain('home-off-s')
  })

  it('每个配色集合都是四个图标，无缺失', () => {
    for (const key of TAB_ORDER) {
      const set = tabIconSet(key)
      expect(Object.keys(set).sort()).toEqual([...TAB_ORDER].sort())
      for (const v of Object.values(set)) expect(v).toMatch(/\.png$/)
    }
  })

  it('★ tabIconSet 生成的 16 个路径对应的文件必须真实存在', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    const root = path.resolve(__dirname, '../../..')      // miniprogram/
    const all = new Set<string>()
    for (const key of TAB_ORDER) {
      for (const p of Object.values(tabIconSet(key))) all.add(p)
    }
    expect(all.size).toBe(16)
    for (const p of all) {
      // p 形如 /assets/tab/home-on.png，实际文件在 src/assets/tab/ 下
      const file = path.join(root, 'src', p.replace(/^\//, ''))
      expect(fs.existsSync(file), `图标文件不存在：${file}`).toBe(true)
    }
  })
})
