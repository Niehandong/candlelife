import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import Screen from '@/components/Screen'
import './index.scss'

export default function Welcome() {
  return (
    <Screen variant="night" className="welcome">
      <View className="welcome__mark">烛生</View>
      <Text className="welcome__slogan">陪你按时睡觉</Text>
      <Text className="welcome__note">
        不需要注册，也不会打扰你。今晚开始，给一天一个明确的收尾。
      </Text>
      <Button
        className="welcome__cta"
        onClick={() => Taro.navigateTo({ url: '/pages/guide/index' })}
      >
        开始
      </Button>
    </Screen>
  )
}
