import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import Screen from '@/components/Screen'
import { assetBase } from '@/store/runtime-config'
import './index.scss'

export default function Goodnight() {
  const { params } = useRouter()
  const base = assetBase()
  const eligible = params.eligible === '1'
  const streak = Number(params.streak ?? 0)

  return (
    <Screen
      variant="night"
      background={base ? `${base}/ui/goodnight-room.jpg` : undefined}
      className="goodnight"
    >
      <Text className="goodnight__title">今天已经好好结束了。晚安。</Text>
      {eligible ? (
        <View className="goodnight__note">
          <Text className="goodnight__streak">连续按时 {streak} 晚</Text>
          {/* 当晚不揭晓——奖励在仪式夜次日 06:00 之后打开小程序时出现 */}
          <Text className="goodnight__tip">明天早上来看看收藏。</Text>
        </View>
      ) : (
        <Text className="goodnight__tip">不用责怪自己。今晚仍然可以重新开始。</Text>
      )}
      <Text
        className="goodnight__back"
        onClick={() => Taro.switchTab({ url: '/pages/home/index' })}
      >
        回到今晚
      </Text>
    </Screen>
  )
}
