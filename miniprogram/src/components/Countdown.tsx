import { Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { countdownState, formatClock, type Phase } from './countdown-state'
import './Countdown.scss'

type Props = { bedtime: string; tz: string; onPhase?: (p: Phase) => void }

export default function Countdown({ bedtime, tz, onPhase }: Props) {
  const [state, setState] = useState(() => countdownState(new Date(), bedtime, tz))

  useEffect(() => {
    const tick = () => {
      const next = countdownState(new Date(), bedtime, tz)
      setState(next)
      onPhase?.(next.phase)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [bedtime, tz, onPhase])

  const late = state.late > 0
  return (
    <View className={`countdown countdown--${state.phase}`}>
      <Text className="countdown__label">{late ? '比计划晚了' : '距离入睡'}</Text>
      <Text className="countdown__value">{formatClock(late ? state.late : state.seconds)}</Text>
    </View>
  )
}
