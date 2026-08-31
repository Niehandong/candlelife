import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { api } from '@/api/endpoints'
import type { RewardItem } from '@/api/types'
import Screen from '@/components/Screen'
import { DEFAULT_CONFIG, loadConfig } from '@/store/runtime-config'
import { queueEvent } from '@/utils/events'
import './index.scss'

export default function Reward() {
  const cfg = loadConfig() ?? DEFAULT_CONFIG
  const [rewards, setRewards] = useState<RewardItem[] | null>(null)
  const [i, setI] = useState(0)

  useEffect(() => {
    // 一次揭晓全部已到窗口的夜记；用户可能数日未打开
    api.revealRewards()
      .then((r) => {
        setRewards(r.rewards)
        queueEvent('reward_revealed', { count: r.rewards.length })
      })
      .catch(() => {
        Taro.showToast({ title: '网络不可用', icon: 'none' })
        setRewards([])
      })
  }, [])

  if (rewards === null) {
    return (
      <Screen variant="dawn" className="reward">
        <Text className="reward__wait">正在揭晓…</Text>
      </Screen>
    )
  }
  if (rewards.length === 0) {
    return (
      <Screen variant="dawn" className="reward">
        <Text className="reward__wait">还没有可以揭晓的礼物。</Text>
        <Text className="reward__back" onClick={() => Taro.navigateBack()}>返回</Text>
      </Screen>
    )
  }

  const item = rewards[i]!
  const last = i === rewards.length - 1

  return (
    <Screen
      variant="dawn"
      background={`${cfg.assets.base_url}/ui/dawn-room.jpg`}
      className="reward"
    >
      <Text className="reward__lede">昨夜按时熄灯，收到一份安静的礼物。</Text>
      <Image className="reward__art" src={item.art.image} mode="aspectFill" />
      <Text className="reward__title">{item.art.title}</Text>
      <Text className="reward__artist">{item.art.artist} · {item.art.year}</Text>
      {rewards.length > 1 && (
        <Text className="reward__count">第 {i + 1} / {rewards.length} 份</Text>
      )}
      <View className="reward__actions">
        <Text
          className="reward__next"
          onClick={() => {
            if (!last) return setI(i + 1)
            Taro.switchTab({ url: '/pages/collection/index' })
          }}
        >
          {last ? '去收藏看看' : '下一份'}
        </Text>
      </View>
    </Screen>
  )
}
