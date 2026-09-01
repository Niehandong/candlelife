# 烛生后端架构重整设计

> 领域术语以根目录 `CONTEXT.md` 为准。
> 阶段一设计见 `2026-08-30-zhusheng-backend-miniprogram-design.md`，
> 阶段二设计见 `2026-08-31-zhusheng-admin-design.md`。
> 本文不引入新功能，只重整已交付代码的**运行环境**与**接口契约**。

## 范围

两件事：

1. **运行环境自洽化** —— 仓库根 `.venv` 目前三处路径不一致，且残留着 `pyproject.toml`
   时代的 editable 安装钩子。
2. **接口契约与分层重整** —— `{code, msg, data}` 信封已经落地一半，本次收口：
   HTTP 状态一律 200、OpenAPI 如实描述、业务逻辑从路由层归位到 service 层。

**不在范围**：数据库 schema、Alembic 迁移、加密方案、`domain/` 纯函数、
双 token 隔离、后台隐私 AST 约束、任何字段改名、任何新接口。

## 已确定的决策

| 决策 | 选择 | 备选与代价 |
|---|---|---|
| venv 位置 | 留在**仓库根** `.venv` | 放回 `backend/.venv` 更贴合「每个项目管自己」，但用户选择维持现状 |
| 调用方式 | **不激活**，一律 `../.venv/bin/python -m xxx` | 激活式更短，但脚本不能依赖调用方是否激活 |
| HTTP 状态码 | **`/api/**` 一律 200**，错误只看 body 的 `code` | 保留真实状态可直接用网关/监控分类，代价是前端要判断两层 |
| 重构力度 | 就地矫正，**不重排目录** | 按领域垂直切分收益有限，1000 行的接口层不值得 |
| 空体响应 | 全部改成 200 + 完整信封 | 遵循 HTTP 语义则前端要处理两种形状 |

### 「一律 200」这个决策的代价，以及对冲

`app/core/codes.py` 现有注释论证过「两层各司其职」：HTTP 状态给网关和监控看，
body 里的 code 给人和前端看。本次决策推翻了它。**注释必须一并改写**，
否则下一个人会照着旧注释以为状态码还是真的。

真实损失只有一项：Nginx access log 里全部是 200，按状态码统计错误率的手段失效。
对冲是一个响应头：

```
X-Biz-Code: 40101
```

Nginx 的 `log_format` 加 `$upstream_http_x_biz_code` 即可继续按业务码统计，
监控不必解析响应体。

---

## 一、运行环境

### 1.1 现状：三处不一致 + 一个幽灵包

`.venv/pyvenv.cfg` 记录着它的出生地：

```
command = /usr/bin/python3 -m venv /home/AI/nhdspace/code/candlelife/backend/.venv
```

它建在 `backend/` 下，后来被整个搬到仓库根。搬家后有三处仍指着旧路径：

| 位置 | 内容 | 后果 |
|---|---|---|
| `.venv/bin/*` 的 shebang | `#!/…/backend/.venv/bin/python3` | `../.venv/bin/alembic` 报 `cannot execute: required file not found` |
| `.venv/pyvenv.cfg` 的 `command` | 同上 | 只是记录，无功能影响 |
| `.venv/bin/activate` 的 `VIRTUAL_ENV` | 同上 | 激活后 venv 指向不存在的目录 |

更要紧的是 site-packages 里的残留：

```
__editable__.zhusheng_backend-0.1.0.pth
__editable___zhusheng_backend_0_1_0_finder.py    MAPPING: app → backend/app
zhusheng_backend-0.1.0.dist-info/
```

这是当年 `pip install -e .` 配合 `pyproject.toml` 装进去的。`pyproject.toml` 已删，
钩子还活着：它往 `sys.meta_path` 里插了一个 finder，把 `import app` 硬绑到
`/home/AI/nhdspace/code/candlelife/backend/app`。

**后果**：在任何目录跑 `python -m pytest`，`import app` 都能成功 —— 不是因为
路径对，是因为有个隐形钩子在兜底。CLAUDE.md 里「从 `backend/` 目录调用」这条约定
一直没有被真正执行过，只是碰巧没出事。这就是「两个环境」那种感觉的来源。

### 1.2 做法：就地修，不重建

**不重建**的理由：`requirements.txt` 用的是 `>=` 范围版本，重建会重新解析依赖，
可能把 fastapi 0.141 / starlette 1.6 / pytest 9.1 拉到更新版本。那是重构之外的变量，
不该和接口重整混在一次改动里。

四步：

1. **冻结版本**：`pip freeze > backend/requirements.lock.txt`，入库。
   `requirements.txt` 保留为**人读的意图清单**（带 `>=`），lock 是**机器读的事实清单**
   （钉死版本）。有了 lock，将来真要重建就是确定性的。
2. **卸掉 editable 幽灵**：`pip uninstall zhusheng-backend`，`.pth`、finder、dist-info
   一并消失。
3. **改回三处路径**：`bin/*` 的 shebang、`pyvenv.cfg`、`bin/activate` 的 `VIRTUAL_ENV`，
   全部指向 `/home/AI/nhdspace/code/candlelife/.venv`。
4. **加护栏测试** `tests/test_env_sanity.py`，见 1.4。

### 1.3 卸掉 editable 之后的行为变化

`import app` 不再有隐形钩子兜底，必须靠「`backend/` 在 `sys.path` 上」这条真规则。
四条入口都满足，但理由各不相同，实施时**必须逐条实测**：

| 入口 | `backend/` 为何在 sys.path 上 |
|---|---|
| `../.venv/bin/python -m pytest` | `tests/__init__.py` 存在，pytest 的 prepend 导入模式把包的上级目录（即 `backend/`）插入 sys.path |
| `../.venv/bin/python -m alembic upgrade head` | `python -m` 把 cwd 插入 sys.path |
| `../.venv/bin/python -m scripts.seed_art` | 同上 |
| `./dev.sh start` | 脚本内 `cd "$ROOT"` 后执行 `main.py`，脚本所在目录进 sys.path |

**已知的行为变化**：从仓库根跑 `python -m pytest backend/tests` 会
`ModuleNotFoundError`。这是把隐式变显式的代价 —— CLAUDE.md 里本来就写着要
`cd backend`，现在这条约定才真正生效。

### 1.4 护栏测试

`backend/tests/test_env_sanity.py`：

- `sys.prefix` 等于仓库根的 `.venv`（跑错解释器时立刻红）
- `sys.meta_path` 里不含任何名字带 `__editable__` 的 finder
- `app.__file__` 位于 `backend/app/` 下，且**不经过** finder 解析

这条测试让「环境又悄悄长出第二套」这件事以后会变红，而不是靠人记得。

---

## 二、响应契约

### 2.1 边界：哪些路径归「一律 200」管

| 路径 | 状态码 | 理由 |
|---|---|---|
| `/api/**` 全部 | **一律 200** | 业务响应。含路径写错（→ `40400`）、方法不对（→ `40500`） |
| `/static/**` | 保持真实 | 文件服务不是业务接口。图片不存在就该 404，浏览器 `<img>` 的 onerror 靠它触发 |
| `/docs`、`/redoc`、`/openapi.json` | 保持真实 | 包了信封 Swagger UI 打不开 |
| `/health` | 200 | 本来就是 200 |

FastAPI 自产的 422（`RequestValidationError`）、Starlette 的 404/405，
一并转成 200 + 对应业务码。

> **实施陷阱**：路由匹配不上时抛的是 **`starlette.exceptions.HTTPException`**，
> 不是 `fastapi.HTTPException`。现有 `register_exception_handlers` 注册在后者上，
> 因此**捕不到未匹配路由的 404**。必须显式注册 Starlette 那个基类的处理器，
> 否则「`/api` 下路径写错也返回 200」这条会静默落空 —— 而且不会有任何测试发现，
> 除非专门写一条打不存在路径的测试。**这条测试要写。**

> **中间件的 `status_code >= 400` 跳过分支保留。** 全部 200 之后它几乎不会触发，
> 但它是最后一道防线：万一有响应绕过了异常处理器，跳过总比包出个双层信封好。

### 2.2 抛出方式：`ApiError`

现有 32 个抛出点都是 `raise HTTPException(status.HTTP_409_CONFLICT, "ART_IN_USE")` ——
HTTP 状态和错误码分开手写，写岔了没有任何东西拦得住。改成：

```python
raise ApiError("ART_IN_USE")
raise ApiError("CONFIG_INVALID", {"fields": [...]})    # 需要带 detail 时
```

`ApiError` 继承 `HTTPException`（沿用现有异常处理器，风险低），
`status_code` 恒为 200，业务码从 `CODE_NUMBERS[name]` 取。

`codes.py` 的「HTTP 状态码 + 两位序号」编号规则**保留**。它不再承载 HTTP 语义，
而是一套读得懂的**命名空间**：看到 `40902` 仍然一眼知道「冲突类的第 2 个」。
`codes.py` 顶部那段论证要改写成这个新说法。

### 2.3 不再有空体响应

| 接口 | 现在 | 改后 |
|---|---|---|
| `DELETE /api/v1/me` | 204 空体 | 200 `{code:200, msg:"success", data:null}` |
| `POST /api/v1/events` | 202 空体 | 同上 |
| `POST /api/v1/admin/password` | 204 空体 | 同上 |
| `DELETE /api/v1/admin/art/{id}` | 204 空体 | 同上 |
| `GET /api/v1/admin/config/export` | attachment 下载 | **不变**（中间件已有 bypass；包了信封文件就不能直接用） |

### 2.4 前端随之改动

两个 `client.ts` 里所有基于 HTTP 状态码的分支删掉，改看 `envelope.code`：

```ts
// 现在                              →  改后
if (response.status === 401)            if (isAuthError(envelope.code))   // 401xx 段
  clearToken()                            clearToken()
if (response.status === 204)            // 删掉，不存在了
  return undefined
if (!response.ok) throw ...             if (envelope.code !== CODE_OK) throw ...
```

`ApiError` 的构造签名从 `(status, code, message, detail)` 变成 `(code, message, detail)`。
`status` 字段没有信息量了，留着只会诱导上层去判断它。

### 2.5 已知缺口：codes.ts 与 codes.py 会漂移

`miniprogram/src/api/codes.ts` 与 `admin/src/api/codes.ts` 手抄了 `codes.py` 的数字，
**没有任何测试守着**。后端改一个编号，两个前端不会变红。

本次**补上**：`admin` 的契约测试新增一条 —— 从 `/openapi.json` 取错误码枚举，
与 `codes.ts` 的常量逐一比对。与既有的 11 条 schema 契约测试同一机制
（需要后端在跑，否则整组 skip）。

---

## 三、OpenAPI

### 3.1 问题

信封是中间件在出口加的，而路由声明的 `response_model=NightList` 描述的是**裸载荷**。
于是 `/docs` 和 `openapi.json` 说的和实际返回的不是一回事。
`admin/src/api/__tests__/contract.test.ts` 那 11 条「与后端 OpenAPI 的契约」，
守的已经不是真实契约了。

### 3.2 做法

不改路由的 `response_model`，在 `create_app()` 里挂一个自定义 `openapi()`：
标准 spec 生成完之后，把每个 200 响应的 schema **原地包一层**。

```jsonc
{ "type": "object",
  "properties": {
    "code": {"type": "integer", "example": 200},
    "msg":  {"type": "string",  "example": "success"},
    "data": { "$ref": "#/components/schemas/NightList" }
  }}
```

**关键约束**：`components.schemas` 里 `NightList`、`AppSection`、`AdminArtItem`
这些业务模型**原样保留**。契约测试读的正是 `components.schemas[name].properties`，
因此那 11 条**一条都不用改，而且立刻重新变成真契约**。

`PUT /api/v1/admin/config` 是特例（`responses={200: {...}}` + `openapi_extra` 补请求体，
且 200 可能返回 `ConfigDiffResponse` 或 `AdminConfigResponse` 两种形状），
单独处理，保持它现有的两种形状描述。

---

## 四、分层归位

### 4.1 现状：路由层在做 service 的事

分层约定写着「`api/v1` 只做出入参转换与依赖注入」，实际上：

| 位置 | 越界内容 |
|---|---|
| `events.py` | 直接 `session.add_all()` + `commit()`，没有 service 也没有 repository |
| `me.py::update_me` | 直接 `WeChatClient()` 调外部服务 + `commit()` |
| `me.py::delete_account` | 直接 `session.delete()` + `commit()` |
| `nights.py::edit_night_text` | 锁定判定 + 加密 + `commit()`，且结尾 `return await get_night(...)` 直接调另一个路由函数 |
| `art.py::collection` | 循环 `art_repo.get_visible()`，**N+1 查询** |
| `rewards.py::pending` | 在路由里跑 domain 判定并组装 |

### 4.2 新增四个 service

| 新文件 | 从哪搬来 | 顺带修掉 |
|---|---|---|
| `services/night.py` | `edit_night_text` 的锁定判定 + 加密 + commit；`get_night` 的解密降级 | 路由不再直接调另一个路由函数 |
| `services/user.py` | `me.py` 的昵称检测 + 改名 + commit、注销 | — |
| `services/event.py` | `events.py` 的 `add_all` + commit | 事件上报第一次有 service 层 |
| `services/collection.py` | `art.py::collection` 的组装 | **N+1 → `art_repo.get_visible_many()` 一次批量取** |

改完后 `api/v1/*.py` 每个函数形状统一为：取参 → `await service.xxx(...)` → 拼 response schema。

**副效益**：路由层不再直接引用 `decrypt_*`，`tests/test_admin_privacy.py` 的 AST 扫描
边界更清晰。

### 4.3 Service 的调用风格统一

`RitualService()` / `RewardService()` 是无状态类，却在路由里裸构造。
`repositories/` 与 `services/admin_*.py` 用的是模块级函数。
仓库里三种风格并存 —— 统一成**模块级 async 函数**。

### 4.4 杂项

- `_now()` 在 `nights.py` 与 `rewards.py` 各定义一份，测试要 patch 两处。
  收进 `app/core/clock.py` 一处。
- `EventItem` / `EventBatch` 从 `schemas/config.py` 挪到 `schemas/event.py`。
- `ArtBrief` / `ArtDetail` / `CollectionItem` / `CollectionResponse`
  从 `schemas/reward.py` 挪到 `schemas/art.py`。

---

## 五、必须修的 bug：运营配置对按时判定不生效

`app/api/v1/nights.py`：

```python
def _ritual_config() -> RitualConfig:
    c = DEFAULT_CONFIG          # ← 永远是常量
    return RitualConfig(tolerance_minutes=c.ritual.tolerance_minutes, ...)
```

**阶段二交付的运营配置，对「按时完成容差」这个最核心的判定完全无效。**
管理员在后台把容差从 30 改成 15，`POST /nights/complete` 仍按 30 判。
同一个仓库里 `api/v1/config.py` 是老老实实 `await load_active_config(session)` 的 ——
两条路径读的不是同一个来源。

改成 FastAPI 依赖注入：

```python
async def get_ritual_config(session: AsyncSession = Depends(get_session)) -> RitualConfig:
    c = await admin_config.load_active_config(session)     # 与 GET /config 同源
    return RitualConfig(tolerance_minutes=c.ritual.tolerance_minutes,
                        min_time=c.schedule.min_time, max_time=c.schedule.max_time)
```

**新增测试**：保存一份把容差改成 15 的运营配置后，`/nights/complete` 的按时判定
必须跟着变。

**与「历史固化」不冲突**：`is_eligible` / `late_minutes` 仍在发生当时写入数据库列，
任何查询不得重算。本次改的只是「写入时用哪个容差」，运营调整依旧只影响此后的仪式夜。

---

## 六、验证

| 对象 | 命令 | 通过标准 |
|---|---|---|
| 后端 | `cd backend && ../.venv/bin/python -m pytest` | 全绿。**342 条**（重构前 319） |
| 后台前端 | `cd admin && npm run typecheck && npm test` | 全绿，**141 条**（重构前 137） |
| 后台契约 | 起着后端跑 `npm test -- contract` | **17 条必须真的执行，不许 skip** |
| 小程序端 | `cd miniprogram && npm test` | 全绿，**132 条**（重构前 127） |
| 双实现契约 | `shared/ritual-cases.json` | **不动** —— 本次不改业务规则 |

`admin/VERIFY.md` 与 `miniprogram/VERIFY.md` 的人工验收项需要补两条：
注销账号、事件上报这两个原本返回空体的接口，前端要能正常处理 200 + 信封。

## 七、CLAUDE.md 需要同步的段落

1. 「命令」一节 —— 补 `requirements.lock.txt`；`python -m` 的理由从「shebang 坏了」
   改成「统一约定」（修好之后 `bin/` 下的可执行文件也能直接跑了）
2. 「首次上手」一节 —— 装依赖改用 lock 文件
3. 新增一小节说明**必须 `cd backend` 才能跑**，以及 `test_env_sanity.py` 守着这件事
4. 「鉴权」一节 —— 补 `ApiError` 与「HTTP 一律 200」，并说明 `X-Biz-Code` 响应头
5. 「运营配置」一节 —— 补上「容差经依赖注入读库」这条，替换掉旧的常量说法

## 八、风险

| 风险 | 应对 |
|---|---|
| 「一律 200」丢掉网关/监控的错误率统计 | `X-Biz-Code` 响应头 + Nginx `log_format` 一行配置 |
| 卸掉 editable 后某条入口 import 不到 `app` | 四条入口逐条实测（1.3 表），并由 `test_env_sanity.py` 长期守着 |
| 前端漏改某个状态码分支 | 全部 `response.status` 分支删干净，由两个 client 的单测覆盖 |
| 一次改动面太大，出问题难定位 | 实施计划分阶段，每阶段结束跑一次全量；环境（第一章）与接口（二至五章）分开提交 |
| OpenAPI 包装写错，契约测试静默失效 | 契约测试里已有一条「永不跳过的哨兵断言」，保持它 |

## 附录：本次重整之前的收尾工作（已完成）

工作区原有 25 个文件的信封改动是半成品，基准测试是 **17 failed / 252 passed / 50 errors**。
重整开工前已修至全绿，问题分五类：

1. `conftest.py` 的 `auth_client` fixture 没改用 `body()` —— 一处造成全部 50 个 error
2. 约 30 处直接从信封读业务字段（`test_reward_api.py`、`test_record_edit.py`、
   `test_collection_api.py`、`test_config_api.py` 四个文件完全没被迁移过）
3. 6 处局部变量/循环变量取名 `body`，遮蔽了同名 helper
4. 5 处在 4xx 响应上调 `body()` —— 该 helper 内部断言 `code == 200`，必然失败
5. 错误信封字段从 `message`/`detail` 改成了 `msg`/`data`，测试还在读旧名；
   还有测试在用 `r.json()["code"].startswith("TOKEN")`，而 code 已是整数

顺带补了两条守卫测试。`codes.py` 里白纸黑字写着「两处缺一，`tests/test_errors.py` 会红」，
**而那条测试并不存在** —— `CODE_NUMBERS` 与 `ERROR_MESSAGES` 只是碰巧一致。
现补上「两张表必须同增同减」与「错误码不许撞号」两条。


---

## 附录二：实施记录（2026-09-01 完成）

全部五章已实施，三端测试全绿：后端 342、后台 141、小程序 132。

### 与设计的偏差

| 处 | 设计怎么写 | 实际怎么做 | 为什么 |
|---|---|---|---|
| 2.2 `ApiError.status_code` | 恒为 200 | 存**推导出的真实状态**（409 这种），「一律 200」在出口处的 `_fail()` 里决定 | 在异常对象上就把信息抹掉，非 API 路径与日志都没得用了；而且 `test_admin_password.py` 那条断言正好守住了 `http_status_for` 的推导规则 |
| 2.5 错误码漂移 | 只给 admin 加 | **两个前端都加了** | 小程序的 `SESSION_DEAD_CODES` 一旦对不上，token 自动刷新会静默失灵，比后台的风险更高 |
| 3 OpenAPI | 只包 schema | 另外把错误码全表放进 `info['x-error-codes']` | 漂移检查需要一个数据源，塞进已有的 openapi.json 比新开一个接口便宜 |
| 4 分层 | 4 个新 service | 4 个新 service + `core/clock.py` + 拆 `schemas/{art,event}.py` | 与设计一致，只是把 4.4 的杂项一并做了 |

### 设计里预判到、实施中确认存在的坑

1. **Starlette 的 404**。异常处理器原本注册在 `fastapi.HTTPException` 上，
   路由未匹配时抛的是 `starlette.exceptions.HTTPException`，捕不到。
   改注册到基类后 curl 实测 `/api/v1/typo` 返回 `200 + 40400`。
   由 `test_unmatched_api_path_is_200_with_not_found_code` 守着。

2. **`contract.test.ts` 一行未改就重新变成真契约**。业务模型留在
   `components.schemas` 里这个约束成立，17 条全过。

### 实施中新发现、设计里没写的

1. **`test_every_error_code_raised_in_app_has_a_message` 会变成假测试**。
   它 AST 扫描的是 `HTTPException(status, "XXX")`，抛出方式改成 `ApiError`
   之后 app/ 里一个都不剩，扫描得到空集、断言恒成立。已改扫 `ApiError`
   并加了 `assert raised` 防空转。

2. **两处局部变量遮蔽**。`test_admin_auth.py` 的限流测试里有个局部变量叫
   `codes`，正好遮蔽 `app.core.codes` 模块；`test_e2e_flow.py` 有个循环变量
   叫 `body`，遮蔽 conftest 的 helper。都已改名。

3. **`POST /admin/art` 还留着 `status_code=201`**。设计只列了 4 个 204/202，
   漏了这个。一并归入 200。

4. **`codes.py` 声称的守卫不存在**。文件里写着「两处缺一，
   `tests/test_errors.py` 会红」，而那条测试从来没有过 ——
   `CODE_NUMBERS` 与 `ERROR_MESSAGES` 只是碰巧一致。已补。

### 上线前必办（新增一条）

**Nginx 的 `log_format` 要加 `$upstream_http_x_biz_code`。**
`/api` 全部返 200 之后，access log 里按状态码统计错误率的手段失效，
这个响应头是唯一的替代。不配的话监控看到的将是「零错误」。
