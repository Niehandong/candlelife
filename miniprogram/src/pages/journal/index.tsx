import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '@/api/endpoints'
import type { NightSummary } from '@/api/types'
import NightCard from '@/components/NightCard'
import Screen from '@/components/Screen'
import './index.scss'

export default function Journal() {
  const [items, setItems] = useState<NightSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = () => {
    setFailed(false)
    api.listNights()
      .then((r) => { setItems(r.items); setLoaded(true) })
      .catch(() => {
        // 读不到列表不等于「还没有记录」——对一个连续记了 20 晚的用户，
        // 弹「你还没有记录」这种假空态比看不到内容还糟。
        setLoaded(true)
        setFailed(true)
        Taro.showToast({ title: '网络不可用', icon: 'none' })
      })
  }

  useDidShow(load)

  return (
    <Screen variant="paper" className="journal">
      <Text className="journal__title">夜记</Text>
      {loaded && failed && (
        <View className="journal__fail">
          <Text className="journal__fail-text">夜记暂时读不到，不是你还没有记录。</Text>
          <Button className="journal__retry" onClick={load}>重试</Button>
        </View>
      )}
      {loaded && !failed && items.length === 0 && (
        <Text className="journal__empty">
          完成一次睡前仪式后，这里会出现你的熄灯时间和夜晚记录。
        </Text>
      )}
      <View className="journal__list">
        {items.map((n) => (
          <NightCard
            key={n.ritual_date}
            night={n}
            onClick={() => Taro.navigateTo({
              url: `/pages/journal-detail/index?ritual_date=${n.ritual_date}` })}
          />
        ))}
      </View>
    </Screen>
  )
}
