/**
 * 这个包是给哪个环境打的。
 *
 * 由 config/index.ts 在构建时写死（`defineConstants` 的 APP_ENV），
 * 运行时改不了 —— 它描述的是「这个包是怎么打出来的」，不是「现在连的是谁」。
 *
 * 【为什么需要它】接口地址是编译期常量，装到手机上之后从界面上看不出
 * 连的是测试还是正式。对着测试数据当正式数据看过一次，就知道这个角标值多少钱了。
 */

declare const APP_ENV: 'local' | 'lan' | 'prod'

export type AppEnv = 'local' | 'lan' | 'prod'

export const appEnv: AppEnv = APP_ENV

/** 是不是发布包。非发布包应当在界面上留下可见痕迹。 */
export const isProdBuild = (): boolean => appEnv === 'prod'

/** 给人看的环境名。发布包返回 null —— 正式环境不该有角标。 */
export function envLabel(): string | null {
  return { local: '本机调试', lan: '局域网调试', prod: null }[appEnv]
}
