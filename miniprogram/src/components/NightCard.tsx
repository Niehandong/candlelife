import { Text, View } from '@tarojs/components'
import type { NightSummary } from '@/api/types'
import './NightCard.scss'

export default function NightCard({ night, onClick }: {
  night: NightSummary; onClick?: () => void
}) {
  const [, m, d] = night.ritual_date.split('-') as [string, string, string]
  return (
    <View className="night-card" onClick={onClick}>
      <Text className="night-card__date">{Number(m)}月{Number(d)}日</Text>
      <Text className={`night-card__badge ${night.is_eligible ? 'is-ok' : ''}`}>
        {night.is_eligible ? '按时' : `晚了 ${night.late_minutes} 分`}
      </Text>
    </View>
  )
}
