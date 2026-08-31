import { Button, Input, Picker, Switch, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '@/api/endpoints'
import type { MeResponse, SettingsPayload } from '@/api/types'
import Screen from '@/components/Screen'
import { clearTokens } from '@/store/auth'
import { clearDraft } from '@/store/draft'
import './index.scss'

export default function Settings() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [nickname, setNickname] = useState('')

  useDidShow(() => {
    api.getMe()
      .then((r) => { setMe(r); setNickname(r.nickname ?? '') })
      .catch(() => Taro.showToast({ title: '网络不可用', icon: 'none' }))
  })

  if (!me) return <Screen variant="paper" className="settings" />

  const patch = async (over: Partial<SettingsPayload>) => {
    // 只记录本次要改的那几个 key 的原值，回滚时也只还原它们——
    // 不能整体保存 me 快照再覆盖回去：并发的另一次 patch 若已成功，
    // 整体覆盖会把它的结果一起抹掉，造成端云不一致且用户无从察觉。
    const rollback = Object.fromEntries(
      Object.keys(over).map((k) => [k, me.settings[k as keyof SettingsPayload]])
    ) as Partial<SettingsPayload>

    setMe((cur) => (cur ? { ...cur, settings: { ...cur.settings, ...over } } : cur))
    try {
      await api.updateSettings({ ...me.settings, ...over })
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
      setMe((cur) => (cur ? { ...cur, settings: { ...cur.settings, ...rollback } } : cur))
    }
  }

  const remove = () => {
    Taro.showModal({
      title: '注销账号',
      content: '将永久删除你的全部夜记、收藏与设置，无法恢复。确定吗？',
      confirmText: '注销',
      confirmColor: '#9b3b33',
      success: async ({ confirm }) => {
        if (!confirm) return
        try {
          await api.deleteAccount()
          clearTokens()
          clearDraft()
          Taro.reLaunch({ url: '/pages/welcome/index' })
        } catch {
          Taro.showToast({ title: '注销失败，请稍后再试', icon: 'none' })
        }
      },
    })
  }

  return (
    <Screen variant="paper" className="settings">
      <Text className="settings__title">设置</Text>

      <View className="settings__row">
        <Text className="settings__label">昵称</Text>
        <Input
          className="settings__input"
          value={nickname}
          placeholder="可不填"
          onInput={(e) => setNickname(e.detail.value)}
          onBlur={() => {
            const v = nickname.trim()
            if (!v || v === me.nickname) return
            api.updateNickname(v)
              .then((r) => { setMe(r); setNickname(r.nickname ?? '') })
              .catch(() => {
                Taro.showToast({ title: '这个昵称不能使用', icon: 'none' })
                setNickname(me.nickname ?? '')   // 回滚到上一次已知有效的昵称
              })
          }}
        />
      </View>

      <Picker
        mode="time" value={me.settings.bedtime}
        onChange={(e) => patch({ bedtime: String(e.detail.value) })}
      >
        <View className="settings__row">
          <Text className="settings__label">计划入睡</Text>
          <Text className="settings__value">{me.settings.bedtime}</Text>
        </View>
      </Picker>

      <Picker
        mode="time" value={me.settings.wake_time}
        onChange={(e) => patch({ wake_time: String(e.detail.value) })}
      >
        <View className="settings__row">
          <Text className="settings__label">计划起床</Text>
          <Text className="settings__value">{me.settings.wake_time}</Text>
        </View>
      </Picker>

      <View className="settings__row">
        <Text className="settings__label">减少动态效果</Text>
        <Switch
          checked={me.settings.reduced_motion}
          onChange={(e) => patch({ reduced_motion: e.detail.value })}
        />
      </View>

      <View className="settings__row settings__row--stack">
        <Text className="settings__label">时区</Text>
        <Text className="settings__note">
          {me.settings.timezone} · 判定按时与揭晓时间都以此为准
        </Text>
      </View>

      <Button className="settings__danger" onClick={remove}>注销账号</Button>
      <Text className="settings__legal">
        感恩与计划的正文加密保存，仅你可见。匿名统计不包含任何正文内容。
      </Text>
    </Screen>
  )
}
