import path from 'node:path'

const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:8010'

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
