# 后台管理系统人工验收清单

自动化测试盖不到的部分。上线前逐条走一遍，勾完为止。

## 一、部署与启动

- [ ] `cd backend && ./dev.sh start` 与 `cd admin && ./dev.sh start` 各自能起，`status` 都显示「在跑」
- [ ] 两边分别 `./dev.sh stop` 之后 `ss -ltn | grep -E ':8010|:8011'` 无输出（不留孤儿进程）
- [ ] 停掉后端后，`cd admin && ./dev.sh status` 提示「后端 :8010 没在跑」
- [ ] 从**另一台机器**打 `http://<服务器IP>:8011` 能打开登录页（Vite 需 `host: true`）
- [ ] 在那台机器上登录后进「作品库」，**10 幅缩略图都显示出来**
      （裂图 = `backend/.env` 的 `ASSET_BASE_URL` 还填着 `localhost`）
- [ ] `cd admin && npm run build` 产出 `dist/`，用 `npx serve dist` 能打开
- [ ] Nginx 配置：`/` 指向 `dist/`，`/api` 与 `/static` 反代到后端，`try_files $uri $uri/ /index.html`
      （BrowserRouter 需要，否则刷新 `/art` 会 404）
- [ ] 后端 `.env` 里 `ADMIN_CORS_ORIGINS` 留空（同源部署）
- [ ] 若分域名部署：设 `ADMIN_CORS_ORIGINS=https://你的后台域名`，重启后端，
      确认浏览器控制台无 CORS 报错

## 二、账号与安全

- [ ] 用 `python -m scripts.create_admin <你的用户名>` 建正式账号（**密码 ≥ 12 位**）
- [ ] **删掉或重置开发期建的 `devadmin` 账号**（开发期建的账号，密码曾在协作记录中出现，视为公开）
- [ ] 输错密码 5 次后第 6 次显示「尝试次数过多，请一分钟后再试」
- [ ] 停用某个管理员（库里 `UPDATE admin_users SET is_active = false WHERE username = '...'`），
      该账号已登录的会话下一次操作立刻被踢出
- [ ] 用小程序的 access_token 打 `/api/v1/admin/me`，返回 401 `TOKEN_KIND_MISMATCH`
- [ ] 关掉浏览器标签再打开，需要重新登录（token 在 sessionStorage）
- [ ] 登录后等 8 小时以上再操作，被要求重新登录
- [ ] 浏览器 DevTools 的 Network 里，任何 admin 响应都不含 `hashed_password` 或 `$2b$`

## 三、隐私

- [ ] 遍历后台全部 5 个页面，**没有任何入口能看到用户、夜记、感恩或明日计划**
- [ ] `grep -rn "decrypt\|NightRecord\|AnalyticsEvent" backend/app/api/v1/admin/` 无输出
- [ ] `curl` 试探 `/api/v1/admin/users`、`/api/v1/admin/nights` 均返回 404

## 四、运营配置

- [ ] 四个配置页各改一个字段，diff 弹窗里列出的**就是**你改的那些，一条不多一条不少
- [ ] 改「按时完成容差」时，diff 弹窗顶部出现黄色警告，写明历史夜记不会被修正
- [ ] 把「可选最早」与「可选最晚」设成同一个时间，保存被拒并在字段旁标红
- [ ] 「导出快照」下载到一个 JSON，内容与当前配置一致
- [ ] 在「记录与奖励」页保存后，去「仪式设置」页刷新，**感恩数量没有被清成默认值**
- [ ] 在「仪式设置」页的阻力选项里按回车能正常换行、打出第二项（这里曾有过 bug）
- [ ] 改完配置后，小程序端（或 `curl /api/v1/config`）读到的是新值
- [ ] 把 `app_config.data` 手动改成 `{"bad": 1}`，`curl /api/v1/config` 仍返回默认值且 200
- [ ] 停掉 Redis，保存配置仍然成功

## 五、作品库

- [ ] 新增一幅作品，图片路径填不存在的文件：出黄色警告但**能保存**
- [ ] 把图片放到 `backend/static/` 对应路径后重新打开编辑，警告消失
- [ ] 下架一幅作品：它退出抽卡池，但用小程序看已收藏的它仍可见
- [ ] 撤回一幅作品：确认弹窗明确说「已收藏的用户也将看不到」；撤回后小程序看不到了
- [ ] 取消撤回后恢复可见
- [ ] 对一幅**被收藏过**的作品，删除按钮是禁用的，鼠标悬停给出原因
- [ ] 用 `curl` 绕过前端直接 `DELETE` 一幅被收藏过的作品，返回 409 且作品仍在
- [ ] 编辑时 slug 输入框是只读的
- [ ] 搜索「莫奈」能搜到，筛选「已撤回」只出撤回的
- [ ] 作品超过 20 幅时出现分页，「第 1–20 项，共 N 幅」的数字对得上
- [ ] 翻到第 2 页后改筛选条件，**回到第 1 页**（不是停在第 2 页看空列表）
- [ ] 删掉某页的最后一条作品后，自动退回上一页而不是停在空页
- [ ] 点「上架 / 下架 / 撤回 有什么区别？」能展开说明，三种状态各自的后果说得清

## 六、契约与回归

- [ ] 起着后端跑 `cd admin && npm test -- contract`，**11 项全过（不是 skip）**
- [ ] `cd backend && .venv/bin/python -m pytest -q` 全绿
- [ ] `cd admin && npm run typecheck` 无错
- [ ] `cd miniprogram && npm test` 仍全绿（阶段一没有被本阶段改动破坏）

## 七、上线前必办

- [ ] **轮换数据库密码与 Redis 密码** —— 它们曾在对话中以明文出现，视为已泄露
- [ ] 确认 `FERNET_KEYS` 已备份到密码管理器（丢失 = 所有历史夜记正文永久不可读）
- [ ] `.env` 的 `ENV=production`，且 `WX_MOCK_LOGIN` 为 false（否则进程拒绝启动）
- [ ] 后台不要暴露在公网；用内网、VPN 或 IP 白名单限制访问
