import { Image, Text, View } from '@tarojs/components'
import type { ArtBrief } from '@/api/types'
import './ArtCard.scss'

export default function ArtCard({ art, count, onClick }: {
  art: ArtBrief; count: number; onClick?: () => void
}) {
  return (
    <View className="art-card" onClick={onClick}>
      <Image className="art-card__thumb" src={art.thumbnail} mode="aspectFill" lazyLoad />
      <Text className="art-card__title">{art.title}</Text>
      {count > 1 && <Text className="art-card__count">× {count}</Text>}
    </View>
  )
}
