import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // 缓存钉在本目录内。下面的 @shared 别名指向 ../shared（在 miniprogram 之外），
  // vitest 会把工作区根算成仓库根，默认就把缓存写到 <仓库根>/node_modules/.vite，
  // 在根目录凭空造出一个没有 package.json 的 node_modules。
  cacheDir: 'node_modules/.vite',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  define: {
    // Taro 的 defineConstants 在测试里不存在，此处补一个
    API_BASE_URL: JSON.stringify('http://localhost:8000'),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
