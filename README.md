# 烛生

睡前仪式养成应用。用户按自己定的时间完成睡前仪式 —— 记下今晚的阻力、写三件感恩与
明日计划、熄灯 —— 按时完成的人在次日清晨收到一幅公共领域艺术作品。

奖励刻意放在**次日清晨**而不是当晚：完成仪式的那一刻不该再有新的刺激内容，
否则奖励本身就成了睡前的干扰。

## 目录

```
backend/       FastAPI + PostgreSQL + Redis，同时服务小程序与后台
miniprogram/   Taro 4 + React，微信小程序
admin/         React 18 + Vite，PC 运营后台
shared/        双实现契约用例（两端读同一份，勿删）
prototype/     视觉与规则的原始来源，只读
docs/          设计规格与实施计划
```

## 起服务

每个项目管自己，各自目录下一个 `dev.sh`：

```bash
cd backend && ./dev.sh start    # :8010，接口文档在 /docs
cd admin   && ./dev.sh start    # :8011
```

都支持 `start` / `stop` / `restart` / `logs [-f]` / `status`。
小程序端没有脚本 —— 它跑在微信开发者工具里。

## 首次上手

**Python 版本要求：>= 3.12**，依赖统一维护在 `backend/requirements.txt`。

Windows PowerShell 首次安装与启动：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
.\.venv\Scripts\python.exe .\backend\main.py
```

启动只运行 `backend/main.py`，不会自动安装依赖或初始化数据库。

```bash
# 1. 后端依赖与配置
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
cd backend && cp .env.example .env        # 填数据库、Redis、FERNET_KEYS、JWT_SECRET

# 2. 建表与灌数据
../.venv/bin/python -m alembic upgrade head
../.venv/bin/python -m scripts.seed_art            # 10 幅公共领域作品
../.venv/bin/python -m scripts.prepare_ui_assets   # 从 prototype/ 生成界面素材

# 3. 建管理员（密码从键盘读，不落命令行历史）
../.venv/bin/python -m scripts.create_admin <用户名>

# 4. 前端依赖
cd ../admin && npm install
cd ../miniprogram && npm install
```

`FERNET_KEYS` 请**另外备份到密码管理器**。夜记正文用它加密，丢了就是所有历史
正文永久不可读，没有后门。

## 测试

```bash
cd backend     && ../.venv/bin/python -m pytest # 约 5 分钟
cd admin       && npm test                       # 起着后端跑，契约测试才不会被跳过
cd miniprogram && npm test
```

## 三条值得先知道的约束

**规则集中在纯函数里。** 全部业务判定（按时资格、连续按时、抽卡次数、揭晓窗口）
在 `backend/app/domain/` 的纯函数中，不碰 IO、不读环境变量、**不调用
`datetime.now()`** —— 当前时刻一律由调用方传入。原型阶段吃过一次亏：实现依赖
系统本地时间，同一输入在 UTC 容器与 +08 浏览器下得出相反结论。

**同一套规则有两份实现，读同一份用例。** Python 是服务端权威，TypeScript 用于
小程序端必须实时计算的场景（倒计时）。两边都读 `shared/ritual-cases.json`
的 55 条用例。改规则的顺序是：先改那份 JSON → 两边同时变红 → 一起修。

**判定结果一旦写入就不再重算。** `is_eligible`、`late_minutes`、
`reward_draw_count` 在发生当时落库，任何查询不得重算。运营调整容差只影响此后的
仪式夜 —— 昨晚已经判定的事不会被今天的配置改写。

## 隐私

夜记正文（感恩、明日计划）用 `MultiFernet` 加密存二进制列。

**运营后台没有任何接口能看到用户个人数据** —— 不列用户、不读夜记、不解密正文。
这条由 `backend/tests/test_admin_privacy.py` 的 AST 扫描把守：一旦 admin 代码里
出现解密函数或夜记模型的引用，测试就红。

## 文档

| | |
|---|---|
| 给 Claude Code 的项目须知 | [`CLAUDE.md`](CLAUDE.md) —— 命令、架构约束、踩过的坑 |
| 领域术语 | [`CONTEXT.md`](CONTEXT.md) —— 仪式夜、资格窗口、揭晓窗口等 |
| 设计规格与实施计划 | [`docs/superpowers/`](docs/superpowers/) |
| 人工验收清单 | `admin/VERIFY.md`、`miniprogram/VERIFY.md` |

## 状态

| 阶段 | 内容 | |
|---|---|---|
| 一 | Python 后端 + 微信小程序 | 已交付 |
| 二 | PC 后台：管理员登录、作品库、42 项运营配置 | 已交付 |
| 三 | 统计与数据看板 | 未开始 |

小程序尚未获取 AppID，`WX_MOCK_LOGIN=true` 时微信登录与内容安全检测走本地桩；
`ENV=production` 且该开关为 true 时进程拒绝启动。
