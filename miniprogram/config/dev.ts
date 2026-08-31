export default {
  env: { NODE_ENV: '"development"' },
  defineConstants: {
    // 开发者工具需勾选「不校验合法域名」；备案完成后改为正式域名
    API_BASE_URL: '"http://127.0.0.1:8010"',
  },
}
