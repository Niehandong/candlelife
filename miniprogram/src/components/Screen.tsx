import { View } from '@tarojs/components'
import type { PropsWithChildren } from 'react'
import './Screen.scss'

type Props = PropsWithChildren<{
  variant?: 'night' | 'paper' | 'dawn'
  background?: string          // 网络图 URL，来自 assets.base_url
  reducedMotion?: boolean
  className?: string
}>

export default function Screen({
  variant = 'night', background, reducedMotion = false, children, className = '',
}: Props) {
  const style = background ? { backgroundImage: `url(${background})` } : undefined
  return (
    <View
      className={`screen screen--${variant} ${reducedMotion ? 'screen--still' : ''} ${className}`}
      style={style}
    >
      <View className="screen__inner">{children}</View>
    </View>
  )
}
