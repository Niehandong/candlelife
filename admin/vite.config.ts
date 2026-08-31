import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    // 绑 0.0.0.0 而不是默认的 localhost —— 否则只有本机能访问，
    // 从局域网内别的机器打 http://<本机IP>:8011 会直接连接被拒。
    host: true,
    port: 8011,
    // 开发期把 /api 代到本地后端，与生产的 Nginx 同源反代形状一致，
    // 因此后端默认不需要开 CORS。
    //
    // 用 8010 而不是惯例的 8000：这台开发机的 8000 已被另一个 FastAPI 项目
    // （eastern-bright-moon）占用。代理指错服务会把管理员密码发给别人的接口，
    // 所以换个端口。生产环境无影响——Nginx 反代后端实际监听的端口即可。
    proxy: {
      '/api': { target: 'http://127.0.0.1:8010', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8010', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
})
