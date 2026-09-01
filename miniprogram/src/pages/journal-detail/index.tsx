import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import type { NightDetail } from '@/api/types'
import Screen from '@/components/Screen'
import { isEditable } from './editable'
import './index.scss'
import { CODE_RECORD_LOCKED } from '@/api/codes'

export default function JournalDetail() {
  const { params } = useRouter()
  const ritualDate = params.ritual_date ?? ''
  const [night, setNight] = useState<NightDetail | null>(null)
  const [tz, setTz] = useState('Asia/Shanghai')
  const [editing, setEditing] = useState(false)
  const [gratitudes, setGratitudes] = useState<string[]>([])
  const [plans, setPlans] = useState<string[]>([])

  useEffect(() => {
    Promise.all([api.getNight(ritualDate), api.getMe()])
      .then(([n, me]) => {
        setNight(n)
        setTz(me.settings.timezone)
        setGratitudes(n.gratitudes)
        setPlans(n.plans)
      })
      .catch(() => Taro.showToast({ title: '打不开这条夜记', icon: 'none' }))
  }, [ritualDate])

  if (!night) return <Screen variant="paper" className="detail" />

  const canEdit = isEditable(night.ritual_date, new Date(), tz)

  const save = async () => {
    try {
      const updated = await api.editNightText(
        night.ritual_date,
        gratitudes.filter((x) => x.trim()),
        plans.filter((x) => x.trim()))
      setNight(updated)
      setEditing(false)
      Taro.showToast({ title: '已保存', icon: 'none' })
    } catch (e) {
      const err = e as ApiError
      // 服务端才是权威：端上以为还能改，服务端可能已固化
      Taro.showToast({
        title: err.code === CODE_RECORD_LOCKED ? '这一晚已经定下了' : err.message,
        icon: 'none',
      })
      setEditing(false)
    }
  }

  return (
    <Screen variant="paper" className="detail">
      <Text className="detail__date">{night.ritual_date}</Text>
      <Text className="detail__status">
        {night.is_eligible ? '按时熄灯' : `晚了 ${night.late_minutes} 分钟`}
      </Text>

      {!night.text_available && (
        <Text className="detail__warn">
          这条记录的正文暂时读不出来，其余信息不受影响。读不出正文时无法编辑，以免覆盖原有内容。
        </Text>
      )}

      <Text className="detail__section">感恩</Text>
      {editing
        ? gratitudes.map((v, i) => (
            <Input
              key={i} className="detail__input" value={v}
              onInput={(e) => {
                const next = [...gratitudes]; next[i] = e.detail.value; setGratitudes(next)
              }}
            />
          ))
        : night.gratitudes.map((v, i) => <Text key={i} className="detail__item">{v}</Text>)}

      <Text className="detail__section">明天的三件事</Text>
      {editing
        ? plans.map((v, i) => (
            <Input
              key={i} className="detail__input" value={v}
              onInput={(e) => { const next = [...plans]; next[i] = e.detail.value; setPlans(next) }}
            />
          ))
        : night.plans.map((v, i) => <Text key={i} className="detail__item">{v}</Text>)}

      {canEdit && night.text_available && (
        <View className="detail__actions">
          {editing
            ? <Button className="detail__save" onClick={save}>保存</Button>
            : <Text className="detail__edit" onClick={() => setEditing(true)}>修改</Text>}
          <Text className="detail__hint">明早 6 点后这一晚会固定下来</Text>
        </View>
      )}
    </Screen>
  )
}
