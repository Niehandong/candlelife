# 烛生 PC 后台管理系统设计（阶段二）

> 领域术语以根目录 `CONTEXT.md` 为准。
> 阶段一交付物见 `docs/superpowers/specs/2026-08-30-zhusheng-backend-miniprogram-design.md`。
> 后台原型 `prototype/zhusheng-admin.html`，只读参考。

## 范围

**阶段二交付**：PC 后台管理系统 —— 管理员登录、艺术作品库管理、运营配置管理。
后台原型的 5 个模块（`config` / `onboarding` / `ritual` / `records` / `art`）全部实现。

不在阶段二：统计与数据看板（阶段三）、多管理员与角色权限、操作审计日志。

**与原定分期的偏离**：初版分期把「运营配置」放在阶段三。用户决定提前到阶段二，
理由是自托管的运营工具做一半等于没有——每改一句文案仍要改代码重新部署。

## 已确定的四项决策

| 决策 | 选择 | 备选与代价 |
|---|---|---|
| 管理员认证 | 用户名 + 密码（bcrypt） | 微信扫码需开放平台审批；无鉴权则端口暴露即全裸 |
| 阶段二范围 | 作品库 + 运营配置（5 个模块全做） | 只做作品库则 5 个菜单 4 个是灰的 |
| 前端与共享 | React 18 + Vite + TS，**类型完全独立** | 共享类型可防漂移，但与「两个前端区分开」相悖 |
| 配置存储 | **单行覆盖，不做版本化** | 版本化可回滚；单行覆盖改错**不可逆**（见下） |

### 单行覆盖的已知代价

配置直接驱动用户可见的判定。容差从 30 手滑改成 3，那一晚所有用户被判为未按时，
写入夜记即**固化**——事后改回 30 不会修正已有夜记，这是「历史固化」原则的必然结果。

用户已知情并选择此方案。在不改变该决策的前提下，设计中保留两条便宜的防线：

1. **保存前 diff 预览**（见第五节）——34 个字段的表单，最大的风险不是不能回滚，
   而是改了自己没意识到改了什么
2. **配置导出**——改动前可导出当前配置为 JSON，作为手动快照。原型本就有这个按钮

---

## 一、整体结构

```
candlelife/
├── backend/          已交付（189 项测试）。新增：
│                       app/api/v1/admin/     管理路由
│                       app/models/admin.py   admin_users + app_config
│                       alembic/versions/     一次迁移
├── miniprogram/      已交付，本阶段不动
└── admin/            新建。React 18 + Vite + TypeScript
                        构建产物为纯静态文件，Nginx 直接 serve
```

**同一个后端服务**，管理路由挂 `/api/v1/admin/*`。不起第二个后端——数据全在这边，
两个服务意味着两套连接池、两份迁移、两处 `FERNET_KEYS`。

**部署形态（裁决）**：假定 **admin 与 API 同源**，由 Nginx 把 `/api` 反代到后端，
后端不开 CORS。同时将 CORS 白名单做成环境变量 `ADMIN_CORS_ORIGINS`（默认空），
分域名部署时改 `.env` 即可，不需改代码。

> 此项用户未明确回答，由实现方裁决。同源部署少一整类跨域问题；
> 环境变量兜底使该裁决可低成本推翻。

---

## 二、鉴权：两套 token 完全隔离

小程序与后台使用**同一套 JWT 机制、不同的 `kind`**：

| | 小程序 | 后台 |
|---|---|---|
| 载荷 | `{sub: user_id, kind: "access"}` | `{sub: admin_id, kind: "admin"}` |
| 有效期 | access 2h / refresh 30d | **8h，无 refresh** |
| 获取方式 | `wx.login` 静默 | 用户名 + 密码 |

现有 `decode_token(token, expect_kind=...)`（`app/core/security.py:35`）已支持 kind 校验，
不匹配返回 401 `TOKEN_KIND_MISMATCH`。**用户 token 打管理接口打不通，反之亦然。**

后台不做 refresh：管理员一天登录一次不算负担，而长效 refresh token 存在浏览器里，
对一个能改全局配置的后台是不必要的攻击面。8 小时到期重新登录。

### 密码

- `bcrypt`（新增依赖 `passlib[bcrypt]`），cost factor 用库默认
- **不提供注册接口**。首个管理员由 CLI 脚本创建：`python -m scripts.create_admin <username>`，
  密码从 stdin 读取不落命令行历史
- **不提供改密接口**（阶段二）。改密同样走 CLI
- 登录失败**不区分**「用户名不存在」与「密码错误」，统一返回 `ADMIN_LOGIN_FAILED`
- 登录接口限流：同一 IP 每分钟 5 次，超出返回 429（Redis 实现，不可用时降级放行）

---

## 三、隐私硬约束

**管理后台不提供任何查看用户个人数据的接口。** 具体地：

- 不列用户、不查单个用户
- 不读 `night_records`（含元数据）
- **绝不解密任何正文**——`app/core/crypto.py` 的 `decrypt_*` 不得被任何 admin 路由调用
- 不读 `analytics_events` 的 `payload`

后台原型本身就没有这类界面。这条约束是把既成事实固化，防止阶段三做数据看板时顺手越界。

**由测试把守**：`tests/test_admin_privacy.py` 用 AST 扫描 `app/api/v1/admin/` 与
`app/services/admin*.py`，断言其中不出现 `decrypt_text` / `decrypt_list` /
`NightRecord` / `AnalyticsEvent` 的引用。

---

## 四、数据模型

```sql
admin_users
  id             UUID PK DEFAULT gen_random_uuid()
  username       TEXT UNIQUE NOT NULL
  hashed_password TEXT NOT NULL          -- bcrypt
  is_active      BOOLEAN NOT NULL DEFAULT true
  last_login_at  TIMESTAMPTZ
  created_at / updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

app_config                                -- 单行覆盖，永远只有一行
  id             SMALLINT PK DEFAULT 1 CHECK (id = 1)   -- 约束「只能有一行」
  data           JSONB NOT NULL           -- 完整配置对象
  updated_by     TEXT NOT NULL            -- 管理员 username
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

`CHECK (id = 1)` 是「单行」这个决策的数据库级落地——应用层写错也插不进第二行。

`data` 用 JSONB 而非逐字段建列：配置字段有 34 个且会随产品演进增减，
逐字段建列意味着每加一个文案就要一次迁移。代价是失去列级类型约束，
由 Pydantic 在写入前校验补上（见第五节）。

**配置的读取路径不变**：`GET /api/v1/config`（公开，小程序用）改为先查 `app_config`，
查不到或校验失败则回落 `domain/config.py` 的常量。**这保证后台没配过、或配置损坏时，
小程序仍能正常启动**——阶段一定下的「坏数据必须降级」在这里同样适用。

---

## 五、运营配置的写入

### 校验

后台提交的配置先过 Pydantic 模型 `AdminConfigPayload`，它是 `ConfigResponse` 的
可写超集，额外校验业务约束：

- `tolerance_minutes` ∈ [0, 180]
- `gratitude_count` / `plan_count` ∈ [1, 5]
- `resistance_options` 长度 ∈ [1, 8]，每项非空且 ≤ 32 字
- 四个时间字段格式 `HH:MM`
- **`min_time` 与 `max_time` 不得相等**（窗口宽度为零则永远不合格）
- 所有文案字段非空、≤ 200 字

校验失败返回 422 + 逐字段错误，前端在对应输入框下红字提示。

### diff 预览

`PUT /api/v1/admin/config` 接受 `?dry_run=true`，此时**不写库**，返回：

```json
{ "changes": [
    { "path": "ritual.tolerance_minutes", "from": 30, "to": 15 },
    { "path": "app.slogan", "from": "陪你按时睡觉", "to": "陪你好好睡" } ],
  "valid": true, "errors": [] }
```

前端在保存前先打 `dry_run`，把变动项列成表格让管理员确认，确认后再打一次不带
`dry_run` 的真实保存。**同一个接口两次调用**，不需要额外的预览接口。

### 生效时机

保存即生效。Redis 里 `zhusheng:config:active` 的缓存在写入后立即失效，
下一次 `GET /config` 重新查库。Redis 不可用时缓存本就不生效，不影响正确性。

---

## 六、艺术作品管理

复用已有的 `art_works` 表，不加字段。

| 操作 | 接口 | 说明 |
|---|---|---|
| 列表 | `GET /api/v1/admin/art` | 含已下架与已撤回，带筛选 |
| 新增 | `POST /api/v1/admin/art` | 8 个必填字段，slug 由 `id` 手填 |
| 修改 | `PATCH /api/v1/admin/art/{id}` | 元数据与文章 |
| 上下架 | `PATCH /api/v1/admin/art/{id}` | `is_active` |
| 撤回 | `PATCH /api/v1/admin/art/{id}` | `is_withdrawn` |
| 删除 | `DELETE /api/v1/admin/art/{id}` | 被收藏过则 409 |

**三种状态的语义**（`CONTEXT.md` 已定义，此处不重复）：上架 / 下架 / 撤回。
后台列表用不同颜色的状态标签区分，并在撤回时二次确认——撤回会让**已收藏用户也看不见**。

**删除**：`rewards.art_id` 外键是 `ON DELETE RESTRICT`，被任何用户收藏过的作品
物理删除会被数据库拒绝。后台捕获该错误返回 409 `ART_IN_USE`，
提示「这幅作品已被收藏，只能下架或撤回，不能删除」。

**图片**：阶段二不做上传。`thumbnail` / `image` 仍是相对路径字符串，
管理员手动把文件放到 `backend/static/art/` 后在后台填路径。
后台提供路径存在性校验（`HEAD` 请求探测拼出的 URL），不存在时黄色警告但**不阻止保存**
——文件可能稍后上传。上传功能待对象存储就绪后在阶段三做。

---

## 七、接口清单

```
POST   /api/v1/admin/login          {username, password} → {access_token}
GET    /api/v1/admin/me                                   → {username, last_login_at}

GET    /api/v1/admin/config                               → 当前生效配置 + updated_by/at
PUT    /api/v1/admin/config[?dry_run] AdminConfigPayload   → 保存或 diff
GET    /api/v1/admin/config/export                        → 下载 JSON 快照

GET    /api/v1/admin/art?status=&q=                       → 作品列表
POST   /api/v1/admin/art             ArtPayload            → 新增
PATCH  /api/v1/admin/art/{art_id}    Partial<ArtPayload>   → 修改 / 上下架 / 撤回
DELETE /api/v1/admin/art/{art_id}                         → 删除（被收藏则 409）
```

全部要求 `kind: "admin"` 的 token，`/admin/login` 除外。

---

## 八、前端结构

```
admin/
  package.json  vite.config.ts  tsconfig.json  index.html
  src/
    main.tsx  App.tsx
    api/
      types.ts        ★ 独立定义，不共享
      client.ts       fetch 封装、token、401 跳登录
      endpoints.ts
      __tests__/contract.test.ts   ★ 与后端 OpenAPI 逐字段比对
    auth/
      LoginPage.tsx  useAuth.ts
    layout/
      Shell.tsx  Sidebar.tsx        5 个模块的导航
    modules/
      config/  onboarding/  ritual/  records/    四个配置模块
      art/                                        作品库
    components/
      Field.tsx  DiffTable.tsx  StatusTag.tsx  ConfirmDialog.tsx
```

**类型完全独立**（用户决定）。防漂移靠 `api/__tests__/contract.test.ts`：
启动后端、拉 `/openapi.json`、把 `types.ts` 的字段与 schema 逐一比对。
后端改字段名 → 这条测试红，而两个前端之间零耦合。

视觉沿用后台原型 `prototype/zhusheng-admin.html`，令牌取自其 `:root`
（与小程序端同源的紫/薰衣草系）。

---

## 九、错误处理

沿用阶段一的错误信封 `{code, message, detail?}`。

**已知问题的连带修复**：后端 `core/errors.py` 当前是 `_envelope(code, code)`，
`message` 字段等于错误码本身。阶段一在小程序端用码→中文映射兜底。
后台**不重复这套兜底**，改为**在后端补全 message**——这是根因所在，
且后台是新代码，此时修改比日后修便宜。

修改后小程序端的映射表成为冗余但无害（它优先用本地映射），不动它。

新增错误码：`ADMIN_LOGIN_FAILED`（401）、`ADMIN_INACTIVE`（403）、
`ART_IN_USE`（409）、`CONFIG_INVALID`（422）。

---

## 十、测试

```
backend/tests/
  test_admin_auth.py       登录成功/失败/限流/kind 隔离/停用账号
  test_admin_config.py     读写、校验边界、dry_run diff、导出、坏数据降级
  test_admin_art.py        增删改查、三状态流转、被收藏时删除返 409
  test_admin_privacy.py  ★ AST 扫描，断言 admin 路由不触碰用户数据与解密

admin/src/api/__tests__/
  contract.test.ts       ★ 与后端 OpenAPI 逐字段比对
```

后端现有 **189 项测试必须保持全绿**。

---

## 十一、不在本次范围

- 统计与数据看板（阶段三）
- 多管理员、角色权限、操作审计日志
- 图片上传（待对象存储）
- 配置版本化与回滚（用户已选择单行覆盖）
- 管理员自助改密（走 CLI）
