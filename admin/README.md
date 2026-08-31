# 烛生 · 管理后台

React 18 + Vite + TypeScript。构建产物是纯静态文件，Nginx 直接 serve。

## 开发

```bash
npm install
npm run dev          # 或直接 ./dev.sh start（推荐，带日志与 pid 管理）
```

本目录有个 `dev.sh` 管自己的开发服务器：

```bash
./dev.sh start      # :8011
./dev.sh stop
./dev.sh restart
./dev.sh logs -f
./dev.sh status     # 顺带报后端在不在跑
```

后端要另外起（`/api` 与 `/static` 代理到它）：

```bash
cd ../backend && ./dev.sh start     # :8010
```

### 从别的机器访问

Vite 已配 `host: true`（绑 0.0.0.0），所以局域网内可以直接打
`http://<本机IP>:8011`。但**还要确认 `backend/.env` 的 `ASSET_BASE_URL` 填的是
本机局域网 IP**，不是 `localhost` —— 作品缩略图由浏览器直接向后端取，
填 `localhost` 会让对方浏览器去找它自己，图片全部裂掉。详见根目录 `CLAUDE.md`。

后台能改全局配置，绑 0.0.0.0 意味着局域网内谁都能打开登录页。上线务必限制访问。

首次使用要先建管理员：

```bash
cd ../backend && .venv/bin/python -m scripts.create_admin <username>
```

> **端口用 8010 / 8011，不用惯例的 8000 / 5173-5174。** 当前开发机的 8000 已被
> 另一个 FastAPI 项目占用，5173 / 5174 / 5273 各有别的项目的 vite 在跑。
> 代理指错服务会把管理员密码发给别人的接口。生产环境无影响 —— Nginx 反代后端
> 实际监听的端口即可。

## 命令

```bash
npm run dev          # 开发服务器
npm run build        # 产出 dist/
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm test -- contract # 只跑与后端 OpenAPI 的契约测试（需要后端在跑）
```

## 与小程序端的关系

**没有共享代码。** `src/api/types.ts` 独立定义，不从 `miniprogram/` 引用任何文件。
这是刻意的决策（两个前端零耦合），代价是可能与后端漂移，由
`src/api/__tests__/contract.test.ts` 与后端 `/openapi.json` 逐字段比对来兜。

后端改了字段名 → 契约测试红 → 改 `types.ts` 对齐后端（后端是权威）。

契约测试在后端没起时会 **skip 而非 fail**：让 `npm test` 在没有后端的机器上永远红，
只会训练开发者忽略红色。发布前必须起着后端跑一次，`VERIFY.md` 有这一条。

## 部署

```nginx
location / {
    root /var/www/zhusheng-admin;
    try_files $uri $uri/ /index.html;    # BrowserRouter 需要
}
location /api    { proxy_pass http://127.0.0.1:8010; }
location /static { proxy_pass http://127.0.0.1:8010; }
```

同源部署时后端不需要开 CORS。分域名部署设 `ADMIN_CORS_ORIGINS`。

**这个后台不应暴露在公网。** 它能改全局配置，用内网、VPN 或 IP 白名单限制访问。

## 隐私约束

管理后台**没有任何接口能看到用户个人数据** —— 不列用户、不读夜记、不解密正文。
后端由 `backend/tests/test_admin_privacy.py` 的 AST 扫描把守，前端由
`src/layout/__tests__/Sidebar.test.tsx` 确认界面上也没有入口。

做阶段三的数据看板时，这条约束需要显式重新设计，不要顺手越界。

## 目录

```
src/
  api/        types.ts（★ 独立类型）/ client.ts / endpoints.ts
  auth/       LoginPage / useAuth / RequireAuth
  layout/     Shell / Sidebar（5 项导航）
  components/ Field / DiffTable / StatusTag / ConfirmDialog / Toast
  modules/
    config/   BasicPage / OnboardingPage / RitualPage / RecordsPage
              + useConfigForm（加载→编辑→dry-run→确认→保存）
    art/      ArtPage / ArtForm / useArtList
  styles/     tokens.css（★ 逐字取自 prototype/zhusheng-admin.html）
```
