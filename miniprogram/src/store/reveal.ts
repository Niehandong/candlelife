import Taro from '@tarojs/taro'
import { api } from '@/api/endpoints'

// 每次启动最多自动跳一次揭晓页。
// 若服务端因作品池为空等原因持续返回 revealable=true，
// 没有这个闸门会造成 home ↔ reward 无限弹跳，而 reward 非 tab 页、无 tabBar，
// 用户只能杀进程。
let attempted = false

/** 仅供测试重置模块级状态，生产代码不得调用。 */
export function __resetForTest(): void {
  attempted = false
}

/** 启动时检查是否有已到窗口的奖励。
 *  揭晓动作本身在 reward 页触发——避免用户还没看到页面就把奖励消耗掉。 */
export async function checkAndRoute(): Promise<boolean> {
  if (attempted) return false
  try {
    const pending = await api.pendingRewards()
    if (!pending.revealable) return false
    attempted = true              // 确认要跳转才置位——网络失败不该永久禁用揭晓
    await Taro.navigateTo({ url: '/pages/reward/index' })
    return true
  } catch {
    return false            // 网络问题不该打断用户
  }
}
