import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '@/api/endpoints'
import type { MeResponse } from '@/api/types'
import Countdown from '@/components/Countdown'
import Screen from '@/components/Screen'
import { calculateOnTimeStreak, currentRitualNight } from '@/domain/ritual'
import { checkAndRoute } from '@/store/reveal'
import { DEFAULT_CONFIG, loadConfig } from '@/store/runtime-config'
import './index.scss'

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [streak, setStreak] = useState(0)
  const [failed, setFailed] = useState(false)
  const config = loadConfig() ?? DEFAULT_CONFIG

  const load = () => {
    setFailed(false)
    void checkAndRoute()        // 有已到窗口的奖励则先跳转揭晓
    Promise.all([api.getMe(), api.listNights()])
      .then(([m, nights]) => {
        setMe(m)
        const records = nights.items.map(
          (n) => [n.ritual_date, n.is_eligible] as [string, boolean],
        )
        setStreak(
          calculateOnTimeStreak(records, currentRitualNight(new Date(), m.settings.timezone)),
        )
      })
      .catch(() => {
        // 拿不到数据不等于「没有记录」——飞行模式/弱网是本项目反复点名的睡前场景，
        // 不能让入口页静默变成一块空白色块。
        setFailed(true)
        Taro.showToast({ title: '网络不可用', icon: 'none' })
      })
  }

  useDidShow(load)

  if (!me) {
    if (failed) {
      return (
        <Screen variant="night" className="home">
          <Text className="home__fail">今晚的信息暂时读不到，不是你还没有记录。</Text>
          <Button className="home__retry" onClick={load}>重试</Button>
        </Screen>
      )
    }
    return <Screen variant="night" className="home" />
  }

  return (
    <Screen
      variant="night"
      background={`${config.assets.base_url}/ui/home-room.jpg`}
      reducedMotion={me.settings.reduced_motion}
      className="home"
    >
      <Text className="home__question">今晚，几点睡？</Text>
      <Countdown bedtime={me.settings.bedtime} tz={me.settings.timezone} />
      <View className="home__meta">
        <Text className="home__streak">连续按时 {streak} 晚</Text>
        <Text className="home__wake">明早 {me.settings.wake_time} 醒来</Text>
      </View>
      <Button className="home__cta" onClick={() => Taro.navigateTo({ url: '/pages/ritual/index' })}>
        开始今晚的仪式
      </Button>
    </Screen>
  )
}
