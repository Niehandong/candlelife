import { useDidShow } from '@tarojs/taro'
import type { PropsWithChildren } from 'react'
import { routeAfterBootstrap } from '@/store/session'
import './app.scss'

export default function App({ children }: PropsWithChildren) {
  // 用 useDidShow 而非 useEffect：每次小程序前台化都会触发，
  // 用户「退出再进」这个自然动作即可重试，不必杀进程冷启动。
  useDidShow(() => {
    routeAfterBootstrap()
  })

  return <>{children}</>
}
