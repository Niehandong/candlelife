# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目

烛生 —— 睡前仪式养成应用。用户按计划时间完成睡前仪式（记录阻力、写感恩与次日计划、
熄灯），按时完成者在次日清晨获得一幅公共领域艺术作品作为奖励。

| 阶段 | 内容 | 状态 |
|---|---|---|
| 一 | Python 后端 + 微信小程序 | 已交付 |
| 二 | PC 后台：管理员登录、作品库、**运营配置** | 已交付 |
| 三 | 统计与数据看板 | 未开始 |

> 运营配置原定阶段三，用户决定提前到阶段二 —— 自托管的运营工具做一半等于没做，
> 每改一句文案仍要改代码重新部署。所以阶段三只剩数据看板。

三个可交付物：

```
backend/       FastAPI + PostgreSQL + Redis，同时服务小程序与后台
miniprogram/   Taro 4 + React，微信小程序
admin/         React 18 + Vite，PC 后台，构建产物交 Nginx
```

## 起服务

**每个项目管自己**，各自目录下一个 `dev.sh`，互不干涉。

```bash
cd backend && ./dev.sh start    # 后端 :8010，文档在 /docs
cd admin   && ./dev.sh start    # 后台前端 :8011
```

两个脚本都支持 `start` / `stop` / `restart` / `logs [-f]` / `status`。
pid 与日志在各自目录的 `.run/`（已 gitignore）。只管进程，不检测也不安装依赖 ——
缺 `.venv` 或 `node_modules` 时报一行原因就停。

后台前端的 `status` 与 `start` 会顺带报后端在不在跑（`/api` 代理依赖它），
但**不会替你去起后端** —— 那是 `backend/dev.sh` 的事。

**小程序端没有脚本** —— 它跑在微信开发者工具里，不是本机常驻服务。

### 从局域网内别的机器访问

要让别的机器打 `http://<本机IP>:8011` 看后台，**三处都要配对**，少一处就白屏或图裂：

| 配置 | 值 | 少了会怎样 |
|---|---|---|
| `admin/vite.config.ts` 的 `server.host` | `true`（绑 0.0.0.0） | Vite 默认只绑 localhost，外部访问直接**连接被拒** |
| `backend/dev.sh` 的 `HOST` | `0.0.0.0`（默认已是） | 图片取不到 |
| `backend/.env` 的 `ASSET_BASE_URL` | `http://<本机IP>:8010/static` | **作品缩略图全裂** —— 填 `localhost` 会让对方浏览器去找它自己 |

第三条最容易漏，因为本机自测时 `localhost` 是对的。`asset_url()` 拼出来的地址是
交给**浏览器和小程序直接取图**的，不经后端转发，所以必须填对方能访问到的地址。
小程序端把 `assets.base_url` 直接当网络图 URL 用（`${base_url}/ui/home-room.jpg`），
因此它**不能改成相对路径**。

`/api` 与 `/static` 走 Vite 的服务端代理（Vite 进程去连 `127.0.0.1:8010`），
所以后端就算只绑 127.0.0.1，接口也是通的 —— 只有图片会因为浏览器直连而失败。

> **这台后台能改全局配置，绑 0.0.0.0 等于局域网内谁都能打开登录页。**
> 当前是私有 10.x 网段、且开发期需要，可以接受；上线务必限制在内网 / VPN /
> IP 白名单内。只想本机可访问：`HOST=127.0.0.1 ./dev.sh start`，
> 并把 `vite.config.ts` 的 `host` 去掉。

### 端口：不要用 8000 / 5173-5174

这台机器的 **8000 属于另一个项目**（另一个 FastAPI 应用，很可能是
`eastern-bright-moon`），**5173 / 5174 / 5273 各有别的项目的 vite 在跑**
（`laser_certificate`、`dormitory` 等）。

所以本项目用 **8010（后端）/ 8011（后台前端）**。这四处必须一致：

- `backend/dev.sh` 的 `PORT` 默认值
- `admin/dev.sh` 的 `PORT` 与 `BACKEND_PORT` 默认值
- `admin/vite.config.ts` 的 `server.port` 与 `/api`、`/static` 代理目标
- `backend/.env` 的 `ASSET_BASE_URL`（换机器/换网段时这一项也要跟着改主机名）

改端口用环境变量，不要改代码：`PORT=9000 ./dev.sh start`。

**为什么值得写进来**：后台前端的开发代理若指向 8000，会把管理员的用户名密码
发给别的项目的服务。两个 `dev.sh` 在 kill 之前都会核对目标进程的**工作目录
是否在自己的目录内**，不属于自己的一律拒绝、只打印它是谁 —— 别的项目的 vite
就靠这一条挡住。

## 命令

### 后端（`backend/`，依赖装在**仓库根**的 `.venv`）

```bash
cd backend

../.venv/bin/python -m pytest                                     # 全部测试（约 5 分钟）
../.venv/bin/python -m pytest tests/test_ritual_api.py -v         # 单个文件
../.venv/bin/python -m pytest tests/test_ritual_api.py::test_complete_on_time -v

../.venv/bin/python -m alembic revision -m "描述"      # 生成空迁移，手写内容（见下）
../.venv/bin/python -m alembic upgrade head

../.venv/bin/python -m scripts.seed_art          # 灌 10 幅艺术作品（幂等）
../.venv/bin/python -m scripts.prepare_ui_assets # 从 prototype/ 生成 static/ui/
../.venv/bin/python -m scripts.create_admin <username>          # 建管理员
../.venv/bin/python -m scripts.create_admin <username> --reset  # 改密码
```

> **虚拟环境在仓库根的 `.venv`，不在 `backend/` 下。** 所以从 `backend/` 里调用
> 要写 `../.venv/bin/...`。依赖清单是 `backend/requirements.txt`（不再是
> `pyproject.toml`），pytest 配置在 `backend/pytest.ini`。
>
> 一律用 `python -m <模块>` 而不是 `.venv/bin/<命令>`：venv 搬过位置后，
> `bin/` 下那些可执行文件的 shebang 还指着旧路径，`../.venv/bin/alembic`
> 会报 `cannot execute: required file not found`。`python -m alembic` 不受影响。

**不要并发跑两个 pytest 会话。** 它们共用 `zhusheng_test` schema，fixture 会
`drop_all` 重建，两个会话互相拆台，结果不可信（踩过）。

**测试连的是 `DATABASE_URL` 指向的库**，schema 由 `TEST_DB_SCHEMA` 决定
（默认 `zhusheng_test`，必须以 `_test` 结尾，`tests/conftest.py` 有三道护栏）。

### 迁移：一律手写，禁止 `--autogenerate`

```bash
../.venv/bin/python -m alembic revision -m "描述"    # 注意：没有 --autogenerate
```

autogenerate 在本项目曾生成 **19 条 `DROP TABLE`**，目标是**另一个项目**在
`public` schema 里的表。`alembic/env.py` 的 `_include_object` 白名单是双保险，
但不要依赖它 —— 手写 `upgrade()` / `downgrade()`，动手前通读一遍生成的文件，
确认里面只有你想要的语句。

### 后台前端（`admin/`）

```bash
cd admin
npm run dev            # 直接跑；一般用 ./dev.sh start（带日志与 pid 管理）
npm run build          # 产出 dist/，交 Nginx
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm test -- contract   # 与后端 OpenAPI 的契约测试（需要后端在跑，否则 skip）
```

### 小程序端（`miniprogram/`）

```bash
cd miniprogram
npm test               # vitest run
npm run build:weapp    # 产出 dist/，导入微信开发者工具
npm run dev:weapp      # 监听模式
```

### 首次上手

```bash
# 依赖装在仓库根的 .venv，清单是 backend/requirements.txt
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt

cd backend && ../.venv/bin/python -m alembic upgrade head
cd backend && ../.venv/bin/python -m scripts.seed_art
cd backend && ../.venv/bin/python -m scripts.create_admin <你的用户名>   # 密码从 stdin 读

cd backend && ./dev.sh start     # 后端 :8010
cd admin   && ./dev.sh start     # 后台前端 :8011
```

后台没有注册接口，也没有改密接口 —— 一个能改全局配置的后台，自助注册就是把门拆了。
建号与改密都走 `scripts/create_admin.py`，需要服务器 shell 权限。

## 清理与部署

### 每次开发完毕：清掉可再生的东西

```bash
cd backend && ./dev.sh clean     # .pytest_cache、__pycache__、*.egg-info、运行日志
cd admin   && ./dev.sh clean     # node_modules/.vite、tsbuildinfo、运行日志
cd admin   && ./dev.sh clean all # 连 dist/ 一起清
```

判断标准只有一条：**一条命令就能重建的，才算产物。**

| 清 | 为什么 | 重建方式 |
|---|---|---|
| `backend/.pytest_cache/` | pytest 的上次运行记录 | 跑一次测试 |
| `backend/**/__pycache__/`（不含 `.venv`） | 字节码缓存 | 下次导入 |
| `backend/*.egg-info/` | 旧构建元数据 | 重装依赖 |
| `admin/node_modules/.vite/` | Vite 依赖预构建缓存 | `npm run dev` |
| `admin/tsconfig.tsbuildinfo` | TS 增量编译信息 | `npm run typecheck` |
| `.run/*.log` | 服务日志 | 下次启动 |

**`.venv` 里的 `__pycache__` 不要动。** 那是依赖自己的缓存（226 个目录、41M），
删了只让下次导入变慢，不是残留。

### 这三样【不是】产物，不要删

| | 是什么 | 删了会怎样 |
|---|---|---|
| `backend/tests/` | 30 个文件、2895 行、**319 个用例** | 安全网没了 |
| `shared/ritual-cases.json` | 双实现契约的 55 条用例 | 两端测试同时红 |

> **没有 `backend/pytest.ini`。** 运行环境改成仓库根的 `.venv` 之后，那个独立的
> 配置文件被删掉了，四项配置搬进了 `tests/conftest.py` 的 `pytest_configure()`。
> 那四项不是可选的 —— 实测删掉配置后跑全量是 **64 failed / 27 errors**
> （异步测试拿不到事件循环）。改 conftest 时别把那个函数删了。

`tests/` 里有几条是**专门守已经发生过的事故**的，删掉等于把教训一起删掉：

- `test_schema_isolation.py` —— 守另一个项目的 `public.users`（那张表被误删过一次）
- `test_admin_privacy.py` —— AST 扫描，守后台不读用户数据、不解密正文
- `test_domain_timezone.py` —— 守 UTC 容器与 +08 浏览器得出相反结论的那个 bug
- `test_domain_contract.py` —— 守 Python 与 TypeScript 两份规则实现不许分家
- `tests/conftest.py` —— 三道护栏，阻止 `drop_all` 顺着 `search_path` 回落到 `public`

### 部署时不带上测试，用排除而不是删除

线上机器确实不需要 `tests/`、`pytest.ini`。做法是**打包时排除**，仓库里留着：

```bash
# 用 rsync 部署时
rsync -a --exclude='tests/' --exclude='pytest.ini' --exclude='__pycache__/' \
      --exclude='.pytest_cache/' --exclude='.venv/' --exclude='.env' --exclude='.run/' \
      backend/ 目标机:/opt/zhusheng/backend/

# 用 Docker 时写进 .dockerignore
```

前端更简单：`npm run build` 的产物 `dist/` 本来就只有编译后的代码，
测试文件不会进去 —— 交给 Nginx 的就是 `dist/`，不是整个 `admin/`。

**区别在于：仓库是开发的底稿，部署包是运行时的切片。** 从底稿上剪掉安全网，
下次改代码就没有任何东西拦着你；从切片里去掉它，什么都不影响。

## 数据库的特殊约束

远程 PostgreSQL 的 `eastern` 库，**`public` schema 已被另一个项目占用**，
且其中有一张**同名的 `users` 表**。本项目的全部对象隔离在独立 schema：

- `zhusheng` —— 应用
- `zhusheng_test` —— 测试（fixture 每次会话 `drop_all` 重建）

模型**不写死 schema**，由连接级 `search_path` 切换（`app/core/db.py`），
配置项为 `DB_SCHEMA`。新增模型时不要加 `__table_args__ = {"schema": ...}`。

当前账号无建库权限，只能建 schema。

> **这里出过一次真事故**：`search_path` 含 `public` 时 `drop_all` 顺着回落，
> 把 `public.users` 删了，用 2026-07-04 的备份恢复的 —— 那个项目在 7 月 4 日
> 之后改过的数据可能是旧的，用户尚未确认过。现在有四道防线：
> `search_path` 只含本项目 schema、conftest 三道断言、Alembic 白名单、
> 以及 `tests/test_schema_isolation.py` 断言 public 的 13 张表完好。

## 架构

### 规则中枢：`app/domain/ritual.py`

全部业务判定集中在这一个模块的**纯函数**里：按时资格、连续按时、抽卡次数、揭晓窗口。

**硬约束**（有测试把守）：

- 不导入 SQLAlchemy / Redis / httpx
- 不读环境变量
- **不调用 `datetime.now()` 或 `date.today()`** —— 当前时刻一律由调用方传入
- **不读系统本地时区** —— 时区从 `user_settings.timezone` 显式传参

最后两条是原型阶段的真实缺陷：原实现依赖系统本地时间，导致同一输入在 UTC 容器与
+08 浏览器下得出相反结论。`tests/test_domain_timezone.py` 专门守这条。

需要当前时刻的路由层用模块级 `_now()` 函数取（便于测试注入），不在 domain 里取。

`app/domain/config.py` 同样是纯函数模块，同样受这些约束。

### 双实现契约：`shared/ritual-cases.json`

同一套规则有两份实现 —— Python（服务端权威）与 TypeScript（小程序端，仅用于
倒计时等必须实时计算的场景）。两边读**同一份用例文件**：

- `backend/tests/test_domain_contract.py`（pytest）
- `miniprogram/src/domain/__tests__/`（vitest）

**改规则的流程**：先改 `shared/ritual-cases.json` → 两边同时红 → 一起修。
不要只改一边的实现。

### 分层

```
api/v1  →  services  →  repositories  →  models
                ↘  domain（纯函数，不得反向依赖任何一层）
```

- `repositories/` 只做数据访问，不含判定逻辑
- `services/` 是事务边界，编排 domain 与 repository
- `api/v1/` 只做出入参转换与依赖注入

### 不可动摇的正确性保证

这些用数据库机制而非应用代码实现，改动时不要绕过：

| 保证 | 机制 |
|---|---|
| 一个仪式夜只有一条夜记 | `UNIQUE(user_id, ritual_date)` + `ON CONFLICT DO NOTHING` |
| 奖励不重复发放 | 事务内 `SELECT ... FOR UPDATE` + `reward_revealed_at` |
| 被收藏过的作品不可删 | `rewards.art_id` 外键 `ON DELETE RESTRICT` |
| 运营配置只有一行 | `app_config` 的 `CHECK (id = 1)` |
| 注销即彻底删除 | 各表外键 `ON DELETE CASCADE` |

**Redis 是优化，不是正确性依赖。** Redis 整体不可用时服务应变慢但绝不发错奖励或
写重记录。任何取用 Redis 的地方都要能接受 `None`，且降级路径要有测试。

### 历史固化

`is_eligible`、`late_minutes`、`reward_draw_count` 在发生当时写入数据库列，
**任何查询不得重算**。运营调整容差只影响此后的仪式夜。

推论：揭晓奖励时的抽卡次数用「该仪式夜当时」的连续天数，不是揭晓时刻的 ——
用户断签后补揭晓，不应因此少拿抽卡。

### 加密

夜记正文（感恩、计划）用 `MultiFernet` 加密存 `BYTEA`。加密字段不可搜索排序，
夜记列表只用明文的日期与资格，正文仅详情页单条解密，失败时降级为 `null` 并保留元数据。

`FERNET_KEYS` 丢失 = 所有历史正文永久不可读，无后门。

### 微信 mock 模式

尚未获取 AppID，`WX_MOCK_LOGIN=true` 时 `code2Session` 与内容安全检测走本地桩。
`ENV=production` 且该开关为 true 时**进程拒绝启动**（`app/core/config.py`）。

## 管理后台（阶段二）

### 鉴权：两套 token 完全隔离

| | 小程序 | 后台 |
|---|---|---|
| 载荷 | `{sub: user_id, kind: "access"}` | `{sub: admin_id, kind: "admin"}` |
| 有效期 | access 2h / refresh 30d | **8h，无 refresh** |
| 获取方式 | `wx.login` 静默 | 用户名 + 密码 |

`decode_token(token, expect_kind=...)` 校验 kind，不匹配返回 401
`TOKEN_KIND_MISMATCH`。用户 token 打管理接口打不通，反之亦然。

后台不做 refresh：长效 refresh token 存在浏览器里，对一个能改全局配置的后台是
不必要的攻击面。前端 token 存 `sessionStorage` 而非 `localStorage`。

密码用 **`bcrypt`（直接依赖，不经 passlib）** —— passlib 1.7.4 最后发版于 2020 年，
与 bcrypt 5.x 不兼容，首次 hash 即抛异常。代价是要自己处理两个边界，都有测试：
密码上限 **72 字节**（中文一字 3 字节，即 24 个汉字）、库里存了坏 hash 时
`checkpw` 抛 `Invalid salt`。

登录限流：同一 IP 每分钟 5 次，Redis 实现，**不可用时降级放行**（限流是优化，
Redis 挂掉时锁死登录等于让运维在最需要进后台时进不去）。

> 写涉及登录的测试时，记得清 `admin:login:<IP>` 这个 Redis 桶 ——
> 测试里所有请求来自同一 IP，60 秒的计数会跨测试累积，
> 单文件跑侥幸通过、全量跑就红。`tests/test_admin_auth.py` 有 autouse fixture。

### 隐私硬约束

`app/api/v1/admin/` 与 `app/services/admin*.py` **不得引用** `decrypt_text` /
`decrypt_list` / `NightRecord` / `AnalyticsEvent`。由 `tests/test_admin_privacy.py`
的 **AST 扫描**把守（AST 而非 grep：grep 会被注释和字符串误伤）。

后台不列用户、不读夜记、不解密任何正文。前端由
`admin/src/layout/__tests__/Sidebar.test.tsx` 断言导航只有五条已知安全的路由。

**阶段三做数据看板时这条约束需要显式重新设计，不要顺手越界。**

> 该测试读 `app.openapi()` 而不是 `app.routes` 来枚举路由：本版 FastAPI 的
> `include_router` 存的是 `_IncludedRouter` 包装对象，`app.routes` 不展平子路由，
> 遍历它会扫出空集 —— 一个「永远通过」的假测试。

### 运营配置

配置存 `app_config` 表的**单行 JSONB**，**不做版本化** —— 用户明确选择了单行覆盖，
代价是改错不可逆。防线是保存前 diff 预览与手动导出快照。

`GET /api/v1/config`（公开）**查库优先、坏数据回落 `domain/config.py` 的常量**。
**回落路径不能删**：小程序启动就要读它，让它 500 等于让所有用户开不了 App。

规范形状是 **42 个字段、5 组**（`app` / `schedule` / `onboarding` / `ritual` / `records`）。
按**领域含义**分组，不按后台页面分组 —— 例如「按时完成容差」在后台画在
「记录与奖励」页，但它属于 `ritual` 组。

**字段名在 5 处必须一致**，改一处就要改五处：

1. `backend/app/domain/config.py` 的 dataclass
2. `backend/app/schemas/admin.py` 的 Pydantic Section
3. `admin/src/api/types.ts` 的 interface
4. `admin/src/components/DiffTable.tsx` 的中文标签表
5. `admin/src/api/__tests__/contract.test.ts` 的断言

第 5 条会在后端改字段名时变红 —— 那是「前后端类型完全独立」这个决定的唯一对冲。
**它需要后端真的在跑**，否则整组 skip；`contract.test.ts` 里有一条永不跳过的
哨兵断言防止「静默跳过被误读成没起后端」。

`PUT /api/v1/admin/config` 刻意接收裸 `dict` 而非 Pydantic 模型：`dry_run` 要把
校验错误当**数据**返回给前端逐字段标红，而不是让 FastAPI 直接抛 422。
副作用是 OpenAPI 看不到请求体形状，靠路由上的 `openapi_extra` 补回。

### 作品库的分页

`GET /api/v1/admin/art` 分页：`page`（≥1）、`page_size`（1–200，默认 20）。
响应的 **`total` 是筛选后的总数，不是本页条数**。

两个刻意的选择：

- **翻过最后一页返回空列表，不是 404。** 删掉最后一页的最后一条后，前端可能
  正停在那一页，报错会让界面卡在一个回不去的状态。前端 `useArtList.reload()`
  另有一层：删掉本页最后一条时自动退一页。
- **`order_by(ArtWork.id)` 不能去掉。** 分页必须有确定排序，否则翻页会重复或
  漏项 —— PostgreSQL 不保证无序查询两次返回同样的顺序。
  `tests/test_admin_art.py::test_ordering_is_stable_across_pages` 守这条。

列表的收藏数用 `art_repo.reward_counts_for()` **一次 GROUP BY 批量取**，
不要退回成每条查一次（原来是 N+1）。

### 前端类型不共享

`admin/src/api/types.ts` **独立定义，不从 `miniprogram/` 引用任何文件**（用户决定：
两个前端零耦合）。代价是可能漂移，由上面第 5 条契约测试兜。
后端改了字段名 → 契约测试红 → **改 `types.ts` 对齐后端**（后端是权威）。

## 领域术语

见根目录 `CONTEXT.md`。「仪式夜」「资格窗口」「揭晓窗口」「连续按时」等术语在代码、
测试与文档中含义统一，不要引入同义词。

## 静态资源

| 目录 | 来源 | 是否入库 |
|---|---|---|
| `backend/static/ui/` | `scripts/prepare_ui_assets.py` 从 `prototype/` 生成 | 忽略（可重建） |
| `backend/static/art/` | Wikimedia Commons 手工下载 | **入库** |
| `miniprogram/src/assets/tab/` | `prepare_ui_assets.py` 生成的 PNG 图标 | 入库（微信打包必需） |

**`static/art/` 不要加进 `.gitignore`。** `scripts/art_sources.py` 只记录了
Wikimedia 的文件名，仓库里**没有下载脚本** —— 忽略它们等于 clone 之后作品图
永久缺失且无法恢复。3.4M 进库是划算的。

图片上传功能待阶段三（对象存储就绪后）。目前管理员手动把文件放进
`backend/static/art/` 再在后台填相对路径；后台会 `HEAD` 探测路径，
取不到给黄色警告但**不阻止保存**（文件可能稍后上传）。

## 参考文档

| | |
|---|---|
| 阶段一设计规格 | `docs/superpowers/specs/2026-08-30-zhusheng-backend-miniprogram-design.md`（含对原型 7 处规则缺陷的修正） |
| 阶段一实施计划 | `docs/superpowers/plans/2026-08-30-zhusheng-backend.md`、`2026-08-31-zhusheng-miniprogram.md` |
| 阶段二设计规格 | `docs/superpowers/specs/2026-08-31-zhusheng-admin-design.md` |
| 阶段二实施计划 | `docs/superpowers/plans/2026-08-31-zhusheng-admin.md`（末尾有「执行记录」，逐条列出计划与实际的偏差） |
| 人工验收 | `admin/VERIFY.md`、`miniprogram/VERIFY.md` |
| 后台说明 | `admin/README.md` |
| 原型归档 | `prototype/` —— 视觉与规则的来源，**只读**。其规则有缺陷，移植以 spec 为准 |

## 本仓库的约定

- **不执行任何 git 命令。** 提交由用户本人审核后手动完成；需要提交时说明改动
  并给出建议的 commit message。**不要 `git init` / `git add` / `git commit` / `git push`。**
- `.superpowers/` 是开发时的流程脚手架，已整体 gitignore，不进版本库。
  设计决策的「为什么」在 `docs/superpowers/` 与本文件里。
- `prototype/` 只读。
- 上线前必办：轮换数据库与 Redis 密码（曾在对话中明文出现）、删掉开发期的
  `devadmin` 账号、备份 `FERNET_KEYS`、把后台限制在内网 / VPN / IP 白名单内。
