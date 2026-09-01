import { CoverView, Video } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import Screen from '@/components/Screen'
import { assetBase } from '@/store/runtime-config'
import './index.scss'

export default function Story() {
  const [base, setBase] = useState('')

  useEffect(() => {
    // 引导页不依赖网络（见 store/session.ts 的 ONBOARDING_ROUTES）——
    // 取不到就不渲染视频，「跳过」始终在，用户不会被卡住。
    setBase(assetBase() ?? '')
  }, [])

  const enter = () => Taro.switchTab({ url: '/pages/home/index' })

  return (
    <Screen variant="dawn" className="story">
      {base ? (
        <Video
          className="story__video"
          src={`${base}/ui/prologue.mp4`}
          autoplay
          controls={false}
          showCenterPlayBtn={false}
          objectFit="cover"
          onEnded={enter}
          onError={enter}          // 取不到视频时不能把用户卡住
        />
      ) : null}
      {/* base 为空时（首启尚未拉到配置）Video 不渲染，不会去请求残缺 URL；
          「跳过」用 CoverView 且始终渲染，所以用户任何情况下都有出口。
          视频本身是原生组件，层级高于普通元素，「跳过」也必须用 CoverView 才压得住。 */}
      <CoverView className="story__skip" onClick={enter}>跳过</CoverView>
    </Screen>
  )
}
