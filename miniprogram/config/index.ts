import path from 'node:path'

/**
 * 构建目标。**改地址只改这张表。**
 *
 * 小程序的接口地址是【编译期常量】，不是运行时读的 —— 改了必须重新
 * `npm run build:weapp`，只在开发者工具里点刷新没用。
 *
 * | 目标 | 什么时候用 |
 * |---|---|
 * | `local` | 后端与开发者工具在【同一台机器】 |
 * | `lan`   | 工具在另一台机器（当前：后端 Linux 服务器，工具 Windows） |
 * | `prod`  | 发布包。域名必须已备案 |
 *
 * ⚠️ 换机器或换网段时改 `lan` 这一行，`backend/.env` 的 ASSET_BASE_URL
 * 也要跟着改 —— 那个是图片地址，小程序拿它当网络图 URL 直接取图，
 * 填错的表现是「接口通但作品图全裂」。
 *
 * 【为什么没有 dev.ts / prod.ts】原先有，但从来没人读过它们：Taro 的多环境
 * 配置要求 index.ts 用 defineConfig(async (merge, { mode }) => ...) 自己去
 * merge，而本文件是普通对象导出。实测在两个文件里各埋一个标记重新构建，
 * 两个标记都不出现在产物里。既然是死文件就删了。
 */
const TARGETS = {
  local: 'http://127.0.0.1:8010',
  lan: 'http://10.111.22.162:8010',
  prod: 'https://REPLACE_WITH_FILED_DOMAIN',
} as const

type Target = keyof typeof TARGETS

// 由 package.json 的脚本用 cross-env 传入（cross-env 是为了 Windows：
// `APP_ENV=x npm run build` 是 Unix 语法，cmd 里会直接报错）。
const appEnv = (process.env.APP_ENV || 'lan') as Target

if (!(appEnv in TARGETS)) {
  throw new Error(
    `APP_ENV=${appEnv} 不认识。可选：${Object.keys(TARGETS).join(' / ')}`,
  )
}

// API_BASE_URL 是逃生口：临时连别的地址时用，不必改表。
const apiBaseUrl = process.env.API_BASE_URL || TARGETS[appEnv]

// ── 发布护栏 ──────────────────────────────────────────────────────
// 把开发机的局域网地址打进发布包，后果是每个用户都连不上，
// 而且【构建不报错】，装到手机上才发现。所以在这里拦死。
if (appEnv === 'prod') {
  if (apiBaseUrl.includes('REPLACE_WITH_FILED_DOMAIN')) {
    throw new Error(
      '发布包的域名还是占位符。备案完成后改 config/index.ts 的 TARGETS.prod，'
      + '或临时用 API_BASE_URL=https://你的域名 npm run build:weapp:prod',
    )
  }
  if (!apiBaseUrl.startsWith('https://')) {
    throw new Error(`发布包的接口地址必须是 https，当前是 ${apiBaseUrl}`)
  }
}

const BANNER = {
  local: '\u001b[36m本机\u001b[0m',
  lan: '\u001b[33m局域网调试\u001b[0m',
  prod: '\u001b[32m正式环境\u001b[0m',
}[appEnv]
console.log(`\n📦 构建目标：${BANNER}  →  ${apiBaseUrl}\n`)

export default {
  projectName: 'zhusheng',
  date: '2026-08-31',
  designWidth: 750,
  deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {
    API_BASE_URL: JSON.stringify(apiBaseUrl),
    // 运行时也能知道自己是哪个包 —— 设置页会显示非正式环境的角标，
    // 免得对着测试数据当正式数据看（见 src/app-env.ts）。
    APP_ENV: JSON.stringify(appEnv),
  },
  alias: {
    '@': path.resolve(__dirname, '..', 'src'),
    '@shared': path.resolve(__dirname, '..', '..', 'shared'),
  },
  copy: {
    // 自定义 tabBar 用运行时字符串路径引用图标（非静态 import），
    // webpack 无法自动分析并拷贝，需显式声明拷贝规则。
    patterns: [{ from: 'src/assets/tab', to: 'dist/assets/tab' }],
    options: {},
  },
  framework: 'react',
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  mini: {
    postcss: {
      pxtransform: { enable: true },
      autoprefixer: { enable: true },
    },
  },
}
