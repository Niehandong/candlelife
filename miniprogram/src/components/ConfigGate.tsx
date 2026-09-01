import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { ConfigResponse } from '@/api/types'
import { loadConfig } from '@/store/runtime-config'
import { routeAfterBootstrap } from '@/store/session'
import Screen from './Screen'
import './ConfigGate.scss'

/**
 * 运行时配置的闸门。
 *
 * 【为什么需要它】用户决定去掉本地的 DEFAULT_CONFIG 兜底，全部配置一律以后端
 * 为准。代价是：拿不到配置时页面无从渲染 —— 睡点、感恩条数、阻力选项、
 * 图片 base_url 全都在配置里。
 *
 * 所以拿不到时不能让页面「带着空值硬渲染」（那会渲染出一个睡点是 undefined、
 * 图片全裂的界面，比报错更糟），而要显式停在这里，给一句人话和一个重试按钮。
 *
 * 【配置从哪来】loadConfig() 读的是本地缓存，由 session.ts 的 bootstrap 在
 * 每次前台化成功拉取 /api/v1/config 之后写入。所以走到这个闸门只有两种情况：
 *   1. 首次启动且 bootstrap 没成功（没网、后端没起、域名没备案）
 *   2. 缓存里的 JSON 结构不合法（isValidConfig 不认）
 * 两种都靠「重试」解决 —— 重试就是再跑一次 bootstrap。
 */
export default function ConfigGate({
  children,
}: {
  children: (config: ConfigResponse) => JSX.Element
}): JSX.Element {
  const config = loadConfig()

  if (config) return children(config)

  const retry = () => {
    void routeAfterBootstrap().then(() => {
      // bootstrap 成功会把配置写进缓存，重进当前页即可读到。
      // 用 redirectTo 而不是 navigateTo：不要在页面栈里堆一层失败页。
      const route = Taro.getCurrentPages().slice(-1)[0]?.route
      if (route) Taro.redirectTo({ url: `/${route}` })
    })
  }

  return (
    <Screen variant="night" className="config-gate">
      <View className="config-gate__box">
        <Text className="config-gate__title">还没连上服务</Text>
        <Text className="config-gate__hint">
          烛生的睡前设置存在服务端，连不上就没法开始今晚的仪式。
          请检查网络后重试。
        </Text>
        <Button className="config-gate__retry" onClick={retry}>
          重试
        </Button>
      </View>
    </Screen>
  )
}
