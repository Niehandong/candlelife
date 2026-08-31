import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '@/api/endpoints'
import type { CollectionResponse } from '@/api/types'
import ArtCard from '@/components/ArtCard'
import Screen from '@/components/Screen'
import './index.scss'

export default function Collection() {
  const [data, setData] = useState<CollectionResponse | null>(null)

  useDidShow(() => {
    api.getCollection()
      .then(setData)
      .catch(() => Taro.showToast({ title: '网络不可用', icon: 'none' }))
  })

  return (
    <Screen variant="paper" className="collection">
      <Text className="collection__title">收藏</Text>
      {data && (
        // 区分「累计卡片数」与「不同作品数」——重复抽中同一幅是允许的
        <Text className="collection__summary">
          已收藏 {data.total_cards} 张 · {data.unique_works} 幅作品
        </Text>
      )}
      {data && data.items.length === 0 && (
        <Text className="collection__empty">
          按计划完成一次熄灯仪式，明天会收到一幅安静的艺术作品。
        </Text>
      )}
      <View className="collection__grid">
        {data?.items.map((item) => (
          <ArtCard
            key={item.art.id}
            art={item.art}
            count={item.count}
            onClick={() => Taro.navigateTo({ url: `/pages/art-detail/index?id=${item.art.id}` })}
          />
        ))}
      </View>
    </Screen>
  )
}
