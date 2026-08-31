# 烛生 · 后端与微信小程序设计（阶段一）

> 领域术语以根目录 `CONTEXT.md` 为准，本文不重复定义。
> 原型代码见 `prototype/`，仅作视觉与规则的来源参考，**不要照抄**——其规则有 7 处缺陷，见下节。

## 范围

**阶段一交付**：Python 后端 + 微信小程序前端，用户能完整跑通睡前仪式并在次日领取奖励。

不在阶段一：PC 后台管理系统（阶段二）、运营配置后台与数据看板（阶段三）。
阶段一的艺术作品与运营配置由 seed 脚本写死，不提供后台录入。
**作品池 seed 10 幅**（公共领域画作），元数据与次日阅读文章由本项目起草、用户定稿。
10 幅可使用户在第一个月约 34 次抽卡中见到约 9.7 幅不同作品，
既跑通完整收集循环，内容量又可控；阶段二后台上线后扩充至 30 幅。

**明确作废的旧约束**：`docs/superpowers/specs/2026-08-27-zhusheng-offline-html-design.md`
中"离线优先、不联网、正文只存本地、配置靠 JSON 文件传递"等前提，自本文起全部作废。

---

## 一、对原型规则的修正

原型 `prototype/zhusheng-core.js` 是业务规则的原始出处，但存在以下缺陷。
**移植时以本节为准。**

### 修正 1 · 揭晓时机（严重）

原实现 `canRevealReward` 比较 `dateKey(completedAt)`，导致同一仪式夜的用户揭晓日不同：

| 场景 | 仪式夜 | 合格 | 原实现最早揭晓 |
|---|---|---|---|
| 计划 23:30，23:59 完成 | 08-27 | 是 | 08-28 |
| 计划 00:30，00:45 完成 | 08-27 | 是 | **08-29** |
| 计划 23:30，00:00 完成（迟 30 分，卡容差边缘） | 08-27 | 是 | **08-29** |

迟一分钟，奖励晚一天。

**改为**：揭晓窗口 = **仪式夜次日 06:00（用户时区）**。窗口开启后首次打开时揭晓。
06:00 与仪式夜的归属边界一致（原实现已用 `getHours() < 6` 判定归属）。

### 修正 2 · 连续按时不随时间衰减

`calculateOnTimeStreak(records)` 不接收当前时间，无法判断"最后一条记录已是半个月前"。
用户连续 5 晚后停用 15 天，首页仍显示"连续按时 5 晚"。

**改为**：`calculate_on_time_streak(records, current_ritual_night)`。
最近夜记的仪式夜若早于「当前仪式夜 − 1 天」，连续按时归零。

### 修正 3 · 提前 6 小时完成也算按时（严重）

原实现下界 `deltaMinutes >= -360`，计划 23:30 的用户**下午 17:30** 点完流程即判定合格。

**改为**：引入**资格窗口**。完成时刻必须落在当晚 `[schedule.minTime, schedule.maxTime]`
之间（默认 20:00–02:00，跨午夜），且不晚于计划时刻加容差。
比计划提前入睡不扣分，只要仍在窗口内。

窗口外完成**仍然产生夜记**（`is_eligible = false`），照常在夜记列表展示，
只是不计入连续按时、不产生奖励。仪式本身完成了，这一点不否认。

### 修正 4 · 激励曲线在第 7 晚断掉

原实现 `rewardDrawCount` 只在 `streak === 3 || streak === 7` 给 2 抽，
导致连续 100 晚与第 1 晚待遇相同，且**故意断签比坚持多拿 25%**：

| 行为（30 晚） | 总抽数 | 平均/晚 |
|---|---|---|
| 连续 30 晚 | 32 | 1.067 |
| 连 3 晚→断→再连 3 晚，循环 10 次 | 40 | **1.333** |

**改为**：
- 基础 1 抽；**连续按时满 14 晚后基础升为 2 抽**（永久，直至中断）
- 里程碑额外 +1 抽：第 3、7、14、30 晚，此后每满 30 晚一次

改后连续 30 晚 = **51 抽**，第 15 晚起每晚稳定 2 抽。

> **门槛为何是 14 而非 30**：初版定 30，实测发现前 37 晚故意断签仍更划算
> （第 30 晚：刷法 40 抽 vs 坚持 35 抽），交叉点在第 38 晚——比多数用户的
> 留存周期还长，等于反向激励未被消除。门槛降至 14 后交叉点提前至**第 16 晚**。
>
> | 晚数 | 坚持 | 最优刷法 | |
> |---|---|---|---|
> | 14 | 18 | 18 | 持平 |
> | 16 | 22 | 21 | 坚持反超 |
> | 30 | 51 | 40 | 坚持领先 |
> | 60 | 112 | 80 | 坚持大幅领先 |
>
> 交叉点由 `test_correction_4_incentive_curve` 钉死。

### 修正 5 · 草稿跨夜残留

`ensureCompletion` 把草稿快照进夜记后**不清空草稿**（`zhusheng-gratitudes` /
`zhusheng-plans` 仅在"清空所有数据"时移除），启动时又恢复回输入框。
用户次日直接完成，会存下与前一晚完全相同的正文。

**改为**：草稿绑定仪式夜，存 `{ritualNight, gratitudes, plans}`，
启动时 `ritualNight !== 当前仪式夜` 即丢弃。草稿只存设备本地，不上传。

### 修正 6 · 时区依赖系统本地时间（严重）

`dateKey` / `plannedDateForCompletion` / `ritualAnchor` 全部使用系统本地时间。
后端容器默认 UTC，同一输入结果相反：

```
输入：计划 23:30，完成 2026-08-27T23:59:00+08:00，容差 30
浏览器 (+08)   planned = 08-27 23:30 (+08)   delta = +29 分    合格 ✓
UTC 容器       planned = 08-27 23:30 (UTC)   delta = −451 分   不合格 ✗
```

**改为**：两份实现均**不得读取系统本地时间**，时区必须作为显式参数传入。
`user_settings.timezone` 为权威来源，默认 `Asia/Shanghai`。

### 修正 7 · 夜记正文不可修改

原实现 `ensureCompletion` 遇到已有记录直接返回，用户无任何补救余地。

**改为**：夜记正文可在**揭晓窗口开启前**修改，此后固化。
修改正文不改变 `completed_at`，因此不影响资格、连续与奖励。

---

## 二、架构

### 仓库结构

```
candlelife/
├── CONTEXT.md                    领域词汇表
├── CLAUDE.md                     由 /init 生成（脚手架完成后）
├── prototype/                    原型归档，只读
├── shared/
│   └── ritual-cases.json         ★ 双实现共同契约
├── backend/
│   ├── app/
│   │   ├── domain/ritual.py      ★ 纯函数，零 IO，权威判定
│   │   ├── core/                 config / db / redis / security / crypto
│   │   ├── models/  schemas/  repositories/  services/  api/v1/
│   │   └── main.py
│   ├── alembic/   static/   tests/
│   ├── pyproject.toml   .env.example
└── miniprogram/                  Taro (React + TypeScript)
    ├── src/
    │   ├── domain/ritual.ts      ★ 同规则的 TS 移植，仅用于即时反馈
    │   ├── pages/  api/  components/
    │   └── app.tsx
    └── package.json
```

### 判定权威与双实现

**服务端是唯一权威。** `POST /nights/complete` 的请求体**不接受**任何判定结果字段
（`is_eligible` 等），服务端用 `user_settings` 重新跑一遍 `domain/ritual.py`。

小程序保留 `domain/ritual.ts`，**仅用于必须在端上实时计算的场景**：
首页倒计时与状态相位、连续天数显示、揭晓窗口是否已开启的启动判断。
这些每秒刷新，不可能调 API。

**离线完成不支持**：断网时提示网络不可用，仪式不计入。不做本地队列与补传。

### 防漂移机制

`shared/ritual-cases.json` 是两份实现的唯一契约：

```json
{
  "evaluate_completion": [
    { "name": "容差内按时",
      "in": { "planned_time": "23:30", "completed_at": "2026-08-27T23:59:00+08:00",
              "tolerance_minutes": 30, "tz": "Asia/Shanghai",
              "min_time": "20:00", "max_time": "02:00" },
      "out": { "eligible": true, "late_minutes": 29, "ritual_date": "2026-08-27" } }
  ],
  "reward_draw_count": [ { "in": { "streak": 3 }, "out": 2 } ]
}
```

pytest 与 vitest 读同一份文件。规则变更 → 改用例 → 两边同时红 → 一起修。
用例种子从原型现有 18 个测试中抽取，不重新编造。

**局限**：契约只保证两份实现在相同输入下输出相同，防不住"两边都错"。
服务端权威仍是最终防线。

---

## 三、数据模型

```sql
users
  id            UUID PK DEFAULT gen_random_uuid()
  openid        TEXT UNIQUE NOT NULL
  unionid       TEXT UNIQUE                        -- 预留
  nickname      TEXT                               -- 可选，过 msgSecCheck
  avatar_url    TEXT                               -- 可选，过 imgSecCheck
  created_at / updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

user_settings
  user_id        UUID PK REFERENCES users(id) ON DELETE CASCADE
  bedtime        TIME NOT NULL DEFAULT '23:30'
  wake_time      TIME NOT NULL DEFAULT '07:30'
  timezone       TEXT NOT NULL DEFAULT 'Asia/Shanghai'
  reduced_motion BOOLEAN NOT NULL DEFAULT false
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()

night_records
  id                 UUID PK
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  ritual_date        DATE NOT NULL
  planned_at         TIMESTAMPTZ NOT NULL
  completed_at       TIMESTAMPTZ NOT NULL
  late_minutes       INTEGER NOT NULL
  is_eligible        BOOLEAN NOT NULL
  resistance_reason  TEXT                          -- 预设选项，非正文
  gratitudes_enc     BYTEA                         -- Fernet 密文
  plans_enc          BYTEA                         -- Fernet 密文
  reward_revealed_at TIMESTAMPTZ                   -- NULL = 未揭晓
  reward_draw_count  SMALLINT                      -- 揭晓时定格
  created_at / updated_at
  UNIQUE (user_id, ritual_date)                    -- ★ 幂等的根
  INDEX  (user_id, ritual_date DESC)

art_works
  id           TEXT PK                             -- slug
  title / artist / year / thumbnail / image / alt / source / article  TEXT NOT NULL
  is_active    BOOLEAN NOT NULL DEFAULT true       -- 下架：不进池，已收藏仍可见
  is_withdrawn BOOLEAN NOT NULL DEFAULT false      -- 撤回：不进池，已收藏也隐藏
  created_at / updated_at
  CHECK (length(btrim(title)) > 0 AND length(btrim(artist)) > 0
     AND length(btrim(article)) > 0 AND length(btrim(alt)) > 0
     AND length(btrim(source)) > 0)

rewards
  id              UUID PK
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  night_record_id UUID NOT NULL REFERENCES night_records(id) ON DELETE CASCADE
  art_id          TEXT NOT NULL REFERENCES art_works(id)      -- RESTRICT：收藏过即不可删
  awarded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  INDEX (user_id, awarded_at DESC)
  -- 故意不加唯一约束：允许重复抽中同一幅

analytics_events
  id         BIGSERIAL PK
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE
  type       TEXT NOT NULL
  payload    JSONB NOT NULL DEFAULT '{}'           -- 严禁正文
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 设计说明

- **`UNIQUE(user_id, ritual_date)`** 是"重复点击不产生重复记录"的落地。
  并发请求下应用层的 `if not exists` 挡不住，唯一索引挡得住。
- **判定结果存列不存计算** —— 历史固化原则。运营改容差不影响已有夜记。
- **`reward_draw_count` 揭晓时定格** —— 否则用户断签后回看历史奖励会发现数字变了。
- **加密字段不可搜索排序** —— 夜记列表只用明文的日期与资格，正文仅详情页单条解密。
  代价：无法实现"搜索我写过的感恩"。
- **图片路径存相对值**（如 `art/monet-water-lilies.jpg`），响应时拼 `ASSET_BASE_URL`。
  从静态目录迁到对象存储只改环境变量，数据库不动。

---

## 四、加密与密钥

使用 `cryptography` 的 **`MultiFernet`**（AES-128-CBC + HMAC-SHA256，自带 nonce 与完整性校验）。

```python
# app/core/crypto.py
FERNET_KEYS = env("FERNET_KEYS").split(",")   # 第一个为主密钥
_fernet = MultiFernet([Fernet(k) for k in FERNET_KEYS])
```

`MultiFernet` 用首个密钥加密，解密时依次尝试全部密钥 —— 轮换时把新密钥插到最前，
历史数据照常可读，无需停机批量重加密。

**硬性规则**：

- `FERNET_KEYS` 仅存 `.env`；仓库只有 `.env.example` 占位符；`.env` 进 `.gitignore`
- **密钥丢失 = 所有历史正文永久不可读**，无后门。必须另存于密码管理器
- 密钥由**用户在本地**执行 `Fernet.generate_key()` 生成，不经过对话
- 解密失败不抛 500：正文返回 `null` + `code: "DECRYPT_FAILED"`，
  夜记的日期与资格照常显示

> **安全提醒**：现有 PostgreSQL 与 Redis 口令已出现在开发对话记录中，
> 且数据库直接暴露于公网 IP。上线前必须轮换。

---

## 五、认证

```
wx.login() → code → POST /auth/wx-login → code2Session → openid
           → UPSERT users → 签发 JWT
```

- access_token 2 小时；refresh_token 30 天，刷新时轮换，检测重放则吊销该用户全部 token
- `session_key` 存 Redis，不落库
- JWT 载荷只含 `user_id` 与过期时间，**不含 openid**

### Mock 模式

尚无 AppID，需支持无凭证开发：

```
WX_MOCK_LOGIN=true    # openid = f"mock_openid_{code}"，msgSecCheck/imgSecCheck 直接通过
```

**启动自检**：`ENV=production` 且 `WX_MOCK_LOGIN=true` 时进程**拒绝启动**。
此开关一旦误留，任何人可伪造 code 登录任意账号，不能只靠人工记得关闭。

### 内容安全

昵称过 `msgSecCheck`、头像过 `imgSecCheck`，不通过返回 422。微信审核硬性要求。
微信侧故障时**拒绝保存**而非放行。

**阶段一头像功能留接口但禁用** —— 需要对象存储承载上传文件，待托管方案落地后开启。

### 注销

提供注销入口，**物理删除**该用户全部数据（依赖 `ON DELETE CASCADE`）。
不做软删除，不保留残影。

---

## 六、API

前缀 `/api/v1`，全部 JSON。

```
POST   /auth/wx-login      {code}            → {access_token, refresh_token, user}
POST   /auth/refresh       {refresh_token}   → {access_token}
DELETE /me                                    → 注销，物理删除

GET    /me                                    → 用户 + 设置
PATCH  /me                 {nickname?}        → 过内容安全检测
PUT    /me/settings        {bedtime, wake_time, timezone, reduced_motion}

POST   /nights/complete    {completed_at, gratitudes[], plans[], resistance_reason?}
                                              → {ritual_date, is_eligible, late_minutes, streak}
GET    /nights?from=&to=                      → 夜记列表（不含正文）
GET    /nights/{ritual_date}                  → 详情（解密正文）
PATCH  /nights/{ritual_date} {gratitudes[], plans[]}   → 仅揭晓窗口开启前允许

GET    /rewards/pending                       → {revealable, ritual_date?}
POST   /rewards/reveal     {ritual_date}      → {rewards:[{art_id, art}]}
GET    /collection                            → {total_cards, unique_works, items[]}

GET    /art/{id}                              → 作品详情
                                                 上架/下架均返回 200（已收藏用户可读）
                                                 撤回返回 410 Gone
GET    /config                                → 运营配置（阶段一为常量）
POST   /events             {events:[...]}     → 批量，严禁正文
```

### 幂等

**`POST /nights/complete`** —— 服务端用 `user_settings` 重算判定，不信任端上任何判定字段。
`INSERT ... ON CONFLICT (user_id, ritual_date) DO NOTHING` + 回查，
重复调用返回同一条记录、HTTP 200。

**`POST /rewards/reveal`** —— 不带参数，一次揭晓**全部**已到窗口的待揭晓夜记
（用户可能数日未打开，届时有多条待揭晓），按仪式夜升序返回，前端依次展示。

事务内 `SELECT ... FOR UPDATE` 锁定各夜记行，校验 `reward_revealed_at IS NULL`
且已过揭晓窗口，抽卡、写 `rewards`、盖 `reward_revealed_at`，单事务提交。
已揭晓的重复调用返回既有奖励，不重抽。

> **★ 抽卡次数必须用「该仪式夜当时」的连续按时天数，不是揭晓时刻的。**
>
> 反例：用户 08-27 完成（当时连续第 7 晚，应得 2 抽），08-28 断签，
> 08-29 才打开揭晓。若按揭晓时刻计算，连续已归零 → 只给 1 抽，
> 用户凭空少一次抽卡。
>
> 实现：`streak` 由「截至该 `ritual_date` 为止的夜记序列」推导，
> 与揭晓发生的时间无关。这是历史固化原则在奖励计算上的体现。

抽卡随机源用 `secrets.SystemRandom()`，不用 `random`。

---

## 七、Redis

| 用途 | Key | TTL | 故障影响 |
|---|---|---|---|
| session_key 暂存 | `zhusheng:wx:sk:{user_id}` | 同微信 | 需重新登录 |
| 运营配置缓存 | `zhusheng:config:active` | 5 min | 回落查库 |
| 完成/揭晓幂等锁 | `zhusheng:lock:night:{user_id}:{date}` | 10 s | **不影响正确性** |
| 接口限流 | `zhusheng:rl:{user_id}:{route}` | 60 s | 降级放行 |

**Redis 是优化，不是正确性依赖。** 全部挂掉，服务应变慢但绝不发错奖励或写重记录 ——
正确性由 `UNIQUE(user_id, ritual_date)` 与 `SELECT ... FOR UPDATE` 保证。

统一 `zhusheng:` 前缀，避免与既有 `REDIS_DB=1` 中其他项目撞 key。

---

## 八、错误处理

```json
{ "code": "RITUAL_ALREADY_COMPLETED",
  "message": "今晚已经完成过了",
  "detail": { "ritual_date": "2026-08-27" } }
```

- **幂等冲突不是错误** —— 重复完成、重复揭晓返回 200 + 既有数据，不返回 409
- **解密失败降级** —— 正文 `null` + `DECRYPT_FAILED`，元数据照常显示
- **微信接口失败** —— `code2Session` 失败返 401；`msgSecCheck` 失败拒绝保存
- **未捕获异常** —— 500 + 请求 ID；响应绝不含堆栈、SQL 或连接串
- **日志脱敏** —— `gratitudes` / `plans` / `openid` / `session_key` 一律不入日志

---

## 九、测试

```
backend/tests/
├── test_domain_contract.py    ★ 读 shared/ritual-cases.json 逐条断言
├── test_domain_timezone.py    ★ 同输入 × UTC / Asia/Shanghai / America/New_York 结果一致
├── test_ritual_api.py           并发两请求只落一条记录
├── test_reward_api.py           揭晓窗口、里程碑与 30 晚双抽、重复揭晓不重抽
├── test_record_edit.py          窗口开启前可改、开启后拒绝
├── test_auth.py                 mock 登录、token 轮换、生产环境拒绝 mock 启动
└── test_crypto.py               加解密往返、MultiFernet 轮换后旧数据可读

miniprogram/src/domain/__tests__/
└── ritual.contract.test.ts    ★ 读同一份 shared/ritual-cases.json
```

并发测试须**真正并发**发出两个 `/nights/complete`，断言库中只有一条记录。

TDD：先写测试确认失败，再实现。

---

## 十、前置条件与风险

| 事项 | 状态 | 影响 |
|---|---|---|
| 小程序 AppID / AppSecret | **未获取** | 真机与上线阻塞；mock 模式可开发 |
| 已备案域名 + HTTPS | **未获取** | 真机阻塞；备案约 2–3 周，建议立即启动 |
| 图片托管（对象存储） | 未定 | 开发期用后端静态目录；`ASSET_BASE_URL` 可平滑迁移 |
| 10 幅作品的图与文章 | 待产出 | 由本项目起草、用户定稿 |
| 作品版权来源核实 | **`source` 字段自带 TODO** | 微信审核对版权敏感，上线前必须落实 |
| 数据库/Redis 口令已泄露 | 待轮换 | 上线前必须更换 |

**小程序包体**：静态资源合计约 12 MB，主包上限 2 MB。
除 16 个导航 SVG（约 30 KB）外，作品图、房间背景、开场视频**全部走网络托管**。

---

## 十一、不在本次范围

- PC 后台管理系统与内容录入（阶段二）
- 运营配置后台、统计看板（阶段三）
- 离线完成与补传
- 微信订阅消息、支付
- 跨设备草稿同步
- 正文的全文搜索（加密存储的固有限制）
