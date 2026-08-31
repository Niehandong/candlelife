import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import Screen from '@/components/Screen'
import { clearDraft, loadDraft, saveDraft, type Draft, type RitualStep } from '@/store/draft'
import { DEFAULT_CONFIG, loadConfig } from '@/store/runtime-config'
import { queueEvent } from '@/utils/events'
import { toIsoWithOffset } from '@/utils/time'
import { STEP_TITLE, canAdvance, nextStep, prevStep } from './steps'
import './index.scss'

const BACKGROUND: Partial<Record<RitualStep, string>> = {
  prep: 'ui/prep-room.jpg',
  quiet: 'ui/quiet-room.jpg',
}

export default function Ritual() {
  const cfg = loadConfig() ?? DEFAULT_CONFIG
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getMe()
      .then((me) => setDraft(loadDraft(new Date(), me.settings.timezone)))
      // 断点续做，跨夜自动作废——拿不到时区时退回默认时区，不能让页面打不开
      .catch(() => setDraft(loadDraft(new Date(), 'Asia/Shanghai')))
  }, [])

  if (!draft) return <Screen variant="night" />

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    saveDraft(next)
  }

  // 按下标写入某一条文本，并把数组补齐到目标下标——避免用户先填第二三条时
  // `[...list]` 在中间留出空洞（sparse array）。空洞序列化成 JSON 会变成
  // null，之后 canAdvance/提交时对 null 调用 .trim() 会直接崩溃。
  const setListItem = (list: string[], index: number, value: string): string[] => {
    const next = Array.from({ length: Math.max(list.length, index + 1) }, (_, i) => list[i] ?? '')
    next[index] = value
    return next
  }

  const finish = async () => {
    setBusy(true)
    try {
      const res = await api.completeNight({
        completed_at: toIsoWithOffset(new Date()),
        gratitudes: draft.gratitudes.filter((x) => x.trim()),
        plans: draft.plans.filter((x) => x.trim()),
        resistance_reason: draft.resistanceReason,
      })
      clearDraft()
      queueEvent('ritual_completed', {
        ritual_date: res.ritual_date, eligible: res.is_eligible,
        late_minutes: res.late_minutes, streak: res.streak,
      })
      Taro.redirectTo({
        url: `/pages/goodnight/index?ritual_date=${res.ritual_date}` +
          `&eligible=${res.is_eligible ? 1 : 0}&streak=${res.streak}`,
      })
    } catch (e) {
      const err = e as ApiError
      // 离线完成不支持——如实告知，不假装成功、不做本地队列
      Taro.showToast({
        title: err.code === 'NETWORK_UNAVAILABLE' ? '网络不可用，仪式未记录' : err.message,
        icon: 'none',
        duration: 2500,
      })
    } finally {
      setBusy(false)
    }
  }

  const advance = () => {
    const n = nextStep(draft.step)
    if (n) return update({ step: n })
    void finish()
  }

  const bg = BACKGROUND[draft.step]
  const ready = canAdvance(draft.step, draft)
  const isWriting = draft.step === 'gratitude' || draft.step === 'plan'
  const list = draft.step === 'gratitude' ? draft.gratitudes : draft.plans
  const count = draft.step === 'gratitude' ? cfg.ritual.gratitude_count : cfg.ritual.plan_count

  return (
    <Screen
      variant={draft.step === 'quiet' ? 'dawn' : 'night'}
      background={bg ? `${cfg.assets.base_url}/${bg}` : undefined}
      className={`ritual ritual--${draft.step}`}
    >
      <Text className="ritual__title">{STEP_TITLE[draft.step]}</Text>

      {draft.step === 'resistance' && (
        <View className="ritual__options">
          {cfg.ritual.resistance_options.map((opt) => (
            <View
              key={opt}
              className={`ritual__option ${draft.resistanceReason === opt ? 'is-on' : ''}`}
              onClick={() => update({ resistanceReason: opt })}
            >
              {opt}
            </View>
          ))}
        </View>
      )}

      {isWriting && (
        <View className="ritual__inputs">
          {Array.from({ length: count }).map((_, i) => (
            <Input
              key={i}
              className="ritual__input"
              value={list[i] ?? ''}
              placeholder={`第 ${i + 1} 件`}
              onInput={(e) => {
                const next = setListItem(list, i, e.detail.value)
                update(draft.step === 'gratitude' ? { gratitudes: next } : { plans: next })
              }}
            />
          ))}
        </View>
      )}

      {draft.step === 'prep' && (
        <Text className="ritual__body">把屏幕调暗，让房间安静下来。剩下的交给时间。</Text>
      )}
      {draft.step === 'quiet' && (
        <Text className="ritual__body">灯关掉，躺好。准备好了就点下面的熄灯。</Text>
      )}

      <View className="ritual__actions">
        {prevStep(draft.step) && (
          <Text className="ritual__back" onClick={() => update({ step: prevStep(draft.step)! })}>
            返回
          </Text>
        )}
        <Button className="ritual__next" disabled={!ready || busy} onClick={advance}>
          {draft.step === 'quiet' ? '熄灯' : '继续'}
        </Button>
      </View>
    </Screen>
  )
}
