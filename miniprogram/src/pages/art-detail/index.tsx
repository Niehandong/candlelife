import { Image, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import type { ArtDetail as Art } from '@/api/types'
import Screen from '@/components/Screen'
import './index.scss'
import { CODE_ART_WITHDRAWN } from '@/api/codes'

export default function ArtDetail() {
  const { params } = useRouter()
  const [art, setArt] = useState<Art | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    api.getArt(params.id ?? '')
      .then(setArt)
      .catch((e: ApiError) => {
        // 作品因版权等原因被撤回，已收藏用户也不再展示。
        // 判断依据是业务码而非 HTTP 410 —— 后端 /api 下的状态一律 200。
        if (e.code === CODE_ART_WITHDRAWN) setGone(true)
        else Taro.showToast({ title: '打不开这幅作品', icon: 'none' })
      })
  }, [params.id])

  if (gone) {
    return (
      <Screen variant="paper" className="art">
        <Text className="art__gone">这幅作品已经下架，不再展示。</Text>
      </Screen>
    )
  }
  if (!art) return <Screen variant="paper" className="art" />

  return (
    <Screen variant="paper" className="art">
      <Image className="art__image" src={art.image} mode="widthFix" />
      <Text className="art__title">{art.title}</Text>
      <Text className="art__meta">{art.artist} · {art.year}</Text>
      <Text className="art__article">{art.article}</Text>
      <Text className="art__source">{art.source}</Text>
    </Screen>
  )
}
