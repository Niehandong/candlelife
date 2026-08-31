import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import Screen from '@/components/Screen'
import { markOnboarded } from '@/store/session'
import './index.scss'

const STEPS = [
  { key: 'rest', title: '先把今天放下', body: '睡前有一段固定的仪式，身体会记住什么时候该停下来。' },
  { key: 'light', title: '让光安静下来', body: '到点后只剩最后一件事：点一下熄灯。' },
  { key: 'gift', title: '第二天早上有份礼物', body: '按时熄灯的夜晚，清晨会收到一幅安静的艺术作品。' },
]

export default function Guide() {
  const [i, setI] = useState(0)
  const step = STEPS[i]!
  const last = i === STEPS.length - 1

  return (
    <Screen variant="night" className="guide">
      <View className="guide__dots">
        {STEPS.map((s, n) => (
          <View key={s.key} className={`guide__dot ${n === i ? 'is-on' : ''}`} />
        ))}
      </View>
      <Text className="guide__title">{step.title}</Text>
      <Text className="guide__body">{step.body}</Text>
      <Button
        className="guide__cta"
        onClick={() => {
          if (!last) return setI(i + 1)
          markOnboarded()
          Taro.redirectTo({ url: '/pages/story/index' })
        }}
      >
        {last ? '进入' : '继续'}
      </Button>
    </Screen>
  )
}
