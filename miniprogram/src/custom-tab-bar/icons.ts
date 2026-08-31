export type TabKey = 'home' | 'journal' | 'collection' | 'settings'

export const TAB_ORDER: TabKey[] = ['home', 'journal', 'collection', 'settings']

export const TAB_LABEL: Record<TabKey, string> = {
  home: '今晚', journal: '夜记', collection: '收藏', settings: '设置',
}

export const TAB_PAGE: Record<TabKey, string> = {
  home: '/pages/home/index',
  journal: '/pages/journal/index',
  collection: '/pages/collection/index',
  settings: '/pages/settings/index',
}

/** 原型里整排图标随当前页换一套配色，微信原生 tabBar 做不到，故自定义。
 *  后缀含义：-dark 深色的今晚页，-c 收藏页，-s 设置页，无后缀为夜记页。 */
const SUFFIX: Record<TabKey, string> = {
  home: '-off-dark', journal: '-off', collection: '-off-c', settings: '-off-s',
}

const icon = (name: string) => `/assets/tab/${name}.png`

export function tabIconSet(current: TabKey): Record<TabKey, string> {
  const suffix = SUFFIX[current]
  const out = {} as Record<TabKey, string>
  for (const key of TAB_ORDER) {
    out[key] = key === current ? icon(`${key}-on`) : icon(`${key}${suffix}`)
  }
  return out
}
