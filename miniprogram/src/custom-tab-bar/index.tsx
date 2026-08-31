import { CoverImage, CoverView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { TAB_LABEL, TAB_ORDER, TAB_PAGE, tabIconSet, type TabKey } from './icons'
import './index.scss'

export default function CustomTabBar() {
  const [current, setCurrent] = useState<TabKey>('home')

  useDidShow(() => {
    const pages = Taro.getCurrentPages()
    const route = pages[pages.length - 1]?.route ?? ''
    const hit = TAB_ORDER.find((k) => TAB_PAGE[k].includes(route))
    if (hit) setCurrent(hit)
  })

  const icons = tabIconSet(current)

  return (
    <CoverView className={`tabbar tabbar--${current}`}>
      {TAB_ORDER.map((key) => (
        <CoverView
          key={key}
          className={`tabbar__item ${key === current ? 'is-active' : ''}`}
          onClick={() => {
            if (key === current) return
            setCurrent(key)
            Taro.switchTab({ url: TAB_PAGE[key] })
          }}
        >
          <CoverImage className="tabbar__icon" src={icons[key]} />
          <CoverView className="tabbar__label">{TAB_LABEL[key]}</CoverView>
        </CoverView>
      ))}
    </CoverView>
  )
}
