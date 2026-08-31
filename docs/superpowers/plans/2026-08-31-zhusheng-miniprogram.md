# 烛生微信小程序（阶段一）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付烛生阶段一的微信小程序前端——静默登录、睡前仪式、次日奖励揭晓、夜记与收藏，视觉延续原型，判定以后端为权威。

**Architecture:** Taro 4 (React + TypeScript) 编译到微信小程序。业务规则有两份实现：服务端 `backend/app/domain/ritual.py` 是权威，端上 `src/domain/ritual.ts` **仅用于必须实时计算的场景**（首页倒计时、状态相位、连续天数显示、揭晓窗口是否已开）。两份实现读同一份 `shared/ritual-cases.json` 契约，防止漂移。**离线完成不支持**：断网时提示网络不可用，仪式不计入。

**Tech Stack:** Taro 4.2.1、React 18、TypeScript 5.9.3、Sass、vitest 3.2.7、微信开发者工具

**Spec:** `docs/superpowers/specs/2026-08-30-zhusheng-backend-miniprogram-design.md`

**依赖：** `docs/superpowers/plans/2026-08-30-zhusheng-backend.md`（已完成，174 项测试通过）

**领域术语：** `CONTEXT.md`

**视觉来源：** `prototype/zhusheng-sleep-figma.html`（只读参考。其**规则**有 7 处缺陷已在 spec 修正，移植时视觉照搬、逻辑以 spec 为准）

## Global Constraints

- **不执行任何 git 命令。** 每个任务末尾给出建议的 commit message，由用户本人审核后手动提交。
- **服务端是判定的唯一权威。** 端上算出的资格/连续/抽数只用于即时显示；任何写接口都不得回传判定结果字段（后端 `extra="forbid"`，传了直接 422）。
- **`src/domain/ritual.ts` 必须是纯函数**：不 import Taro/API/storage，不调用 `Date.now()` 或无参 `new Date()`。当前时刻一律由调用方传入。
- **草稿只存设备本地，绑定仪式夜，过夜作废**，不上传（spec 修正 5）。
- **时区显式传递**：判定用 `user_settings.timezone`，不读设备本地时区做业务判断（spec 修正 6）。
- **主包上限 2MB。** 除自定义 tabBar 图标外，房间背景、开场视频、故事序列图**全部走网络**。
- API 基址、资源基址来自配置，**不在代码里硬编码域名**。
- 匿名事件 payload **严禁**包含 `gratitudes` / `plans` / `openid` / `nickname` 等字段（后端 schema 层会拒收）。
- 默认值（来自 `/api/v1/config`）：容差 30 分钟、资格窗口 `20:00`–`02:00`、仪式夜边界 6 点、揭晓窗口次日 `06:00`、基础双抽门槛 14 晚。

---

## File Structure

```
shared/ritual-cases.json          已存在，两端共用契约（改需同步后端）

miniprogram/
  package.json  tsconfig.json  vitest.config.ts
  project.config.json             微信开发者工具项目配置
  config/index.ts  dev.ts  prod.ts
  VERIFY.md                       人工验收清单
  src/
    app.config.ts                 页面注册、custom tabBar
    app.tsx  app.scss             入口与设计令牌
    domain/
      ritual.ts               ★  契约实现，纯函数
      types.ts
      __tests__/ritual.contract.test.ts
      __tests__/ritual.purity.test.ts
    api/
      types.ts                    与 OpenAPI 字段名一一对应
      client.ts                   请求封装：token、401 刷新、错误信封
      endpoints.ts                16 个接口的类型化函数
      __tests__/client.test.ts
    store/
      auth.ts                     token 存取
      session.ts                  静默登录与启动引导
      runtime-config.ts           /config 缓存
      draft.ts                ★  绑定仪式夜的草稿
      reveal.ts                   揭晓检查与路由
      __tests__/{draft,bootstrap,reveal}.test.ts
    custom-tab-bar/               4 tab × 4 配色（原生 tabBar 做不到）
      icons.ts  index.tsx  index.config.ts  index.scss
      __tests__/tabbar.test.ts
    components/
      Screen.tsx                  页面容器：背景、安全区、减少动效
      Countdown.tsx  countdown-state.ts
      NightCard.tsx  ArtCard.tsx
      __tests__/countdown.test.ts
    pages/
      welcome/ guide/ story/
      home/ ritual/ goodnight/ reward/
      journal/ journal-detail/
      collection/ art-detail/
      settings/
    utils/
      time.ts                     设备时刻 → 带偏移 ISO
      events.ts                   匿名事件本地队列
      __tests__/events.test.ts
    assets/tab/                   打进包的 tabBar 图标（PNG）
```

---

### Task 0: 脚手架、构建配置与测试环境

**Files:**
- Create: `miniprogram/package.json`, `tsconfig.json`, `vitest.config.ts`, `project.config.json`
- Create: `miniprogram/babel.config.js`, `.npmrc`
- Create: `miniprogram/config/index.ts`, `dev.ts`, `prod.ts`
- Create: `miniprogram/src/app.config.ts`, `app.tsx`, `app.scss`
- Create: `miniprogram/src/pages/home/index.tsx`, `index.config.ts`
- Create: `miniprogram/src/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev:weapp`、`build:weapp`、`test`、`typecheck`
- Produces: 路径别名 `@/*` → `src/*`，`@shared/*` → `../shared/*`

- [ ] **Step 1: 写冒烟测试**

`miniprogram/src/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('工程配置', () => {
  it('可以解析 @shared 别名下的契约文件', async () => {
    const cases = (await import('@shared/ritual-cases.json')).default as Record<string, unknown>
    expect(Object.keys(cases)).toContain('evaluate_completion')
    expect(Object.keys(cases)).toContain('reward_draw_count')
  })

  it('契约用例数量与后端一致', async () => {
    const cases = (await import('@shared/ritual-cases.json')).default as unknown as Record<string, unknown[]>
    const total = Object.entries(cases)
      .filter(([k]) => k !== '_comment')
      .reduce((n, [, v]) => n + v.length, 0)
    expect(total).toBeGreaterThanOrEqual(46)
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test`
Expected: FAIL — 依赖未安装

- [ ] **Step 3: 写 package.json**

```json
{
  "name": "zhusheng-miniprogram",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev:weapp": "taro build --type weapp --watch",
    "build:weapp": "taro build --type weapp",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@babel/runtime": "^7.26.0",
    "@tarojs/components": "4.2.1",
    "@tarojs/plugin-framework-react": "4.2.1",
    "@tarojs/plugin-platform-weapp": "4.2.1",
    "@tarojs/react": "4.2.1",
    "@tarojs/runtime": "4.2.1",
    "@tarojs/shared": "4.2.1",
    "@tarojs/taro": "4.2.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@babel/preset-react": "^7.24.1",
    "@tarojs/cli": "4.2.1",
    "@tarojs/webpack5-runner": "4.2.1",
    "@types/react": "^18.3.12",
    "babel-preset-taro": "4.2.1",
    "sass": "^1.83.0",
    "typescript": "5.9.3",
    "vitest": "^3.2.7",
    "webpack": "5.91.0"
  }
}
```

> TypeScript 固定 5.9.3：Taro 4.2 未针对 TS 7 验证，锁版本避免编译器行为漂移。
>
> `@tarojs/webpack5-runner`、`babel-preset-taro`、`@babel/preset-react`、`webpack`
> 是 Taro 4.2 webpack5 编译链路的必需件——缺任一 `build:weapp` 都跑不通。

同目录还需 `miniprogram/babel.config.js`：

```js
module.exports = {
  presets: [
    ['taro', {
      framework: 'react',
      ts: true,
    }],
  ],
}
```

以及 `miniprogram/.npmrc`（**不可省略**）：

```
legacy-peer-deps=true
```

> vitest 依赖的 vite 版本与 Taro 插件声明的 `peerOptional vite@^4` 冲突，
> 不加这一行 `npm install` 会直接 ERESOLVE 失败，整个工程装不起来。

- [ ] **Step 4: 写 tsconfig.json 与 vitest.config.ts**

`miniprogram/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["@tarojs/taro"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src", "config", "../shared/*.json"]
}
```

`miniprogram/vitest.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
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
```

- [ ] **Step 5: 写 Taro 构建配置**

`miniprogram/config/index.ts`:

```ts
import path from 'node:path'

export default {
  projectName: 'zhusheng',
  date: '2026-08-31',
  designWidth: 750,
  deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  alias: {
    '@': path.resolve(__dirname, '..', 'src'),
    '@shared': path.resolve(__dirname, '..', '..', 'shared'),
  },
  // icons.ts 用运行时字符串路径引用 tabBar 图标，webpack 不会自动拷贝这类资源。
  // 不配这一项，dist/ 下根本没有 assets 目录，真机上 tabBar 是一片空白图标。
  copy: {
    patterns: [{ from: 'src/assets/', to: 'dist/assets/' }],
    options: {},
  },
  framework: 'react',
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  mini: {
    postcss: {
      pxtransform: { enable: true },
      autoprefixer: { enable: true },
    },
  },
}
```

`miniprogram/config/dev.ts`:

```ts
export default {
  env: { NODE_ENV: '"development"' },
  defineConstants: {
    // 开发者工具需勾选「不校验合法域名」；备案完成后改为正式域名
    API_BASE_URL: '"http://localhost:8000"',
  },
}
```

`miniprogram/config/prod.ts`:

```ts
export default {
  env: { NODE_ENV: '"production"' },
  defineConstants: {
    API_BASE_URL: '"https://REPLACE_WITH_FILED_DOMAIN"',
  },
  mini: {},
}
```

- [ ] **Step 6: 写最小可运行的应用入口**

`miniprogram/src/app.config.ts`:

```ts
export default defineAppConfig({
  pages: ['pages/home/index'],
  window: {
    backgroundTextStyle: 'dark',
    navigationStyle: 'custom',
    backgroundColor: '#17141D',
  },
})
```

`miniprogram/src/app.tsx`:

```tsx
import type { PropsWithChildren } from 'react'
import './app.scss'

export default function App({ children }: PropsWithChildren) {
  return <>{children}</>
}
```

`miniprogram/src/app.scss`:

```scss
page {
  background: #17141d;
  color: #f3ebf1;
  font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif;
}
```

`miniprogram/src/pages/home/index.config.ts`:

```ts
export default definePageConfig({ navigationStyle: 'custom' })
```

`miniprogram/src/pages/home/index.tsx`:

```tsx
import { View } from '@tarojs/components'

export default function Home() {
  return <View className="home">烛生</View>
}
```

`miniprogram/project.config.json`:

```json
{
  "miniprogramRoot": "dist/",
  "projectname": "zhusheng",
  "description": "烛生 · 陪你按时睡觉",
  "appid": "touristappid",
  "setting": {
    "urlCheck": false,
    "es6": false,
    "minified": false
  },
  "compileType": "miniprogram"
}
```

> `appid` 暂用 `touristappid`（游客模式），拿到真实 AppID 后替换。
> `urlCheck: false` 让开发者工具跳过合法域名校验——备案完成前唯一能联调的方式。

- [ ] **Step 7: 安装依赖并运行测试，确认 GREEN**

Run:
```bash
cd miniprogram && npm install
npm test
npm run typecheck
```
Expected: 2 passed；typecheck 无错误

> `.npmrc` 已写入 `legacy-peer-deps=true`，无需手动加 `--legacy-peer-deps` 参数。
> npm 11 的 allow-scripts 网关可能拦截 Taro/swc/esbuild 的安装脚本，
> 核实来源后批准即可（npm 会写入 package.json 的 `allowScripts` 字段）。

- [ ] **Step 8: 交付检查**

确认 `npm run build:weapp` 产出 `dist/`，微信开发者工具可导入该目录。

建议 commit message：`chore(miniprogram): 初始化 Taro 工程与测试环境`

---

### Task 1: 领域纯函数 TS 移植 ★ 核心

与后端 `app/domain/ritual.py` 行为必须完全一致，由 `shared/ritual-cases.json` 锁定。

**Files:**
- Create: `miniprogram/src/domain/types.ts`, `ritual.ts`
- Create: `miniprogram/src/domain/__tests__/ritual.contract.test.ts`
- Create: `miniprogram/src/domain/__tests__/ritual.purity.test.ts`

**Interfaces:**
- Produces: `RITUAL_NIGHT_BOUNDARY_HOUR = 6`、`REVEAL_HOUR = 6`、`BASE_DOUBLE_STREAK = 14`
- Produces: `type CompletionAssessment = { ritualDate: string; plannedAt: Date; completedAt: Date; lateMinutes: number; eligible: boolean }`
- Produces: `currentRitualNight(now: Date, tz: string): string`
- Produces: `evaluateCompletion(input: { plannedTime: string; completedAt: Date; tz: string; toleranceMinutes: number; minTime: string; maxTime: string }): CompletionAssessment`
- Produces: `calculateOnTimeStreak(records: Array<[string, boolean]>, currentNight: string): number`
- Produces: `rewardDrawCount(streak: number): number`
- Produces: `revealWindowOpensAt(ritualDate: string, tz: string): Date`
- Produces: `canReveal(input: { ritualDate: string; isEligible: boolean; rewardRevealedAt: Date | null; now: Date; tz: string }): boolean`
- Produces: `summarizeCollection(artIds: string[]): { totalCards: number; uniqueWorks: number; counts: Record<string, number> }`

- [ ] **Step 1: 写契约测试**

`miniprogram/src/domain/__tests__/ritual.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import cases from '@shared/ritual-cases.json'
import * as ritual from '../ritual'

type Case<I, O> = { name?: string; in: I; out: O }

describe('evaluate_completion', () => {
  const list = cases.evaluate_completion as Case<any, any>[]
  it.each(list.map((c) => [c.name ?? JSON.stringify(c.in), c] as const))('%s', (_n, c) => {
    const got = ritual.evaluateCompletion({
      plannedTime: c.in.planned_time,
      completedAt: new Date(c.in.completed_at),
      tz: c.in.tz,
      toleranceMinutes: c.in.tolerance_minutes,
      minTime: c.in.min_time,
      maxTime: c.in.max_time,
    })
    expect(got.ritualDate).toBe(c.out.ritual_date)
    expect(got.lateMinutes).toBe(c.out.late_minutes)
    expect(got.eligible).toBe(c.out.eligible)
  })
})

describe('current_ritual_night', () => {
  const list = cases.current_ritual_night as Case<any, string>[]
  it.each(list.map((c) => [c.name!, c] as const))('%s', (_n, c) => {
    expect(ritual.currentRitualNight(new Date(c.in.now), c.in.tz)).toBe(c.out)
  })
})

describe('calculate_on_time_streak', () => {
  const list = cases.calculate_on_time_streak as Case<any, number>[]
  it.each(list.map((c) => [c.name!, c] as const))('%s', (_n, c) => {
    expect(ritual.calculateOnTimeStreak(c.in.records, c.in.current_night)).toBe(c.out)
  })
})

describe('reward_draw_count', () => {
  const list = cases.reward_draw_count as Case<{ streak: number }, number>[]
  it.each(list.map((c) => [String(c.in.streak), c] as const))('streak=%s', (_n, c) => {
    expect(ritual.rewardDrawCount(c.in.streak)).toBe(c.out)
  })
})

describe('can_reveal', () => {
  const list = cases.can_reveal as Case<any, boolean>[]
  it.each(list.map((c) => [c.name!, c] as const))('%s', (_n, c) => {
    expect(
      ritual.canReveal({
        ritualDate: c.in.ritual_date,
        isEligible: c.in.is_eligible,
        rewardRevealedAt: c.in.reward_revealed_at ? new Date(c.in.reward_revealed_at) : null,
        now: new Date(c.in.now),
        tz: c.in.tz,
      })
    ).toBe(c.out)
  })
})

describe('summarize_collection', () => {
  const list = cases.summarize_collection as Case<{ art_ids: string[] }, any>[]
  it.each(list.map((c, i) => [i, c] as const))('case %i', (_n, c) => {
    const got = ritual.summarizeCollection(c.in.art_ids)
    expect(got.totalCards).toBe(c.out.total_cards)
    expect(got.uniqueWorks).toBe(c.out.unique_works)
    expect(got.counts).toEqual(c.out.counts)
  })
})
```

- [ ] **Step 2: 写纯度测试**

`miniprogram/src/domain/__tests__/ritual.purity.test.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = fs.readFileSync(path.resolve(__dirname, '../ritual.ts'), 'utf8')
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('domain 纯度', () => {
  it('不 import 任何运行时依赖', () => {
    const imports = [...CODE.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
    for (const i of imports) {
      expect(i.startsWith('@tarojs'), `不得依赖 ${i}`).toBe(false)
      expect(i.includes('/api/'), `不得依赖 ${i}`).toBe(false)
      expect(i.includes('/store/'), `不得依赖 ${i}`).toBe(false)
    }
  })

  it('不读取当前时刻', () => {
    // 当前时刻必须由调用方传入，否则无法测试且会引入设备时区依赖
    expect(CODE).not.toMatch(/Date\.now\(\)/)
    expect(CODE).not.toMatch(/new Date\(\s*\)/)
  })
})
```

- [ ] **Step 3: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/domain`
Expected: FAIL — `Cannot find module '../ritual'`

- [ ] **Step 4: 实现 domain/types.ts**

```ts
export type CompletionAssessment = {
  /** 仪式夜，YYYY-MM-DD */
  ritualDate: string
  plannedAt: Date
  completedAt: Date
  lateMinutes: number
  eligible: boolean
}

export type CollectionSummary = {
  totalCards: number
  uniqueWorks: number
  counts: Record<string, number>
}
```

- [ ] **Step 5: 实现 domain/ritual.ts**

用 `Intl.DateTimeFormat.formatToParts` 取目标时区的墙钟读数——微信基础库 2.x 起支持。
**不使用 `Date` 的本地方法**（`getHours` 等），那些读的是设备时区。

```ts
import type { CollectionSummary, CompletionAssessment } from './types'

export const RITUAL_NIGHT_BOUNDARY_HOUR = 6
export const REVEAL_HOUR = 6
export const BASE_DOUBLE_STREAK = 14

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** 取某时刻在指定时区的墙钟读数。不依赖设备本地时区。 */
function wallClock(instant: Date, tz: string): Wall {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const { type, value } of fmt.formatToParts(instant)) p[type] = value
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour === '24' ? '0' : p.hour),
    minute: Number(p.minute), second: Number(p.second),
  }
}

/** 目标时区在该时刻的 UTC 偏移（分钟）。 */
function offsetMinutes(instant: Date, tz: string): number {
  const w = wallClock(instant, tz)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return Math.round((asUtc - instant.getTime()) / 60000)
}

/** 把目标时区的墙钟时间还原为真实时刻。 */
function fromWallClock(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  const off = offsetMinutes(guess, tz)
  const first = new Date(guess.getTime() - off * 60000)
  // DST 切换日偏移可能变化，再修正一次即可收敛
  const off2 = offsetMinutes(first, tz)
  return off2 === off ? first : new Date(guess.getTime() - off2 * 60000)
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateKey = (w: Wall) => `${w.year}-${pad(w.month)}-${pad(w.day)}`

function parseTime(hhmm: string): [number, number] {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) throw new Error(`时间格式必须为 HH:MM，收到 ${hhmm}`)
  return [Number(m[1]), Number(m[2])]
}

function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number]
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** 此刻所处的仪式夜。凌晨 6 点前算前一晚。 */
export function currentRitualNight(now: Date, tz: string): string {
  return dateKey(wallClock(new Date(now.getTime() - RITUAL_NIGHT_BOUNDARY_HOUR * 3600000), tz))
}

function inEligibilityWindow(hh: number, mm: number, minTime: string, maxTime: string): boolean {
  const t = hh * 60 + mm
  const [minH, minM] = parseTime(minTime)
  const [maxH, maxM] = parseTime(maxTime)
  const lo = minH * 60 + minM
  const hi = maxH * 60 + maxM
  return lo <= hi ? t >= lo && t <= hi : t >= lo || t <= hi   // 窗口可跨午夜
}

export function evaluateCompletion(input: {
  plannedTime: string; completedAt: Date; tz: string
  toleranceMinutes: number; minTime: string; maxTime: string
}): CompletionAssessment {
  const { plannedTime, completedAt, tz, toleranceMinutes, minTime, maxTime } = input
  const w = wallClock(completedAt, tz)
  const [ph, pm] = parseTime(plannedTime)
  const base = dateKey(w)

  // 在前一天/当天/次日三个候选中取距完成时刻最近的计划时刻
  const candidates = [-1, 0, 1].map((off) => {
    const key = shiftDateKey(base, off)
    const [y, m, d] = key.split('-').map(Number) as [number, number, number]
    return fromWallClock(y, m, d, ph, pm, tz)
  })
  const plannedAt = candidates.reduce((best, c) =>
    Math.abs(c.getTime() - completedAt.getTime()) < Math.abs(best.getTime() - completedAt.getTime())
      ? c : best)

  const deltaMinutes = Math.floor((completedAt.getTime() - plannedAt.getTime()) / 60000)
  const pw = wallClock(plannedAt, tz)
  // 仪式夜由计划时刻归属：凌晨 6 点前的计划属于前一晚
  const ritualDate = pw.hour < RITUAL_NIGHT_BOUNDARY_HOUR
    ? shiftDateKey(dateKey(pw), -1)
    : dateKey(pw)

  return {
    ritualDate,
    plannedAt,
    completedAt,
    lateMinutes: Math.max(0, deltaMinutes),
    eligible:
      inEligibilityWindow(w.hour, w.minute, minTime, maxTime) && deltaMinutes <= toleranceMinutes,
  }
}

export function calculateOnTimeStreak(
  records: Array<[string, boolean]>, currentNight: string
): number {
  const byDate = new Map(records)
  if (byDate.size === 0) return 0
  const latest = [...byDate.keys()].sort().pop()!
  if (daysBetween(latest, currentNight) > 1) return 0   // 中间已有整夜缺席
  if (!byDate.get(latest)) return 0

  let streak = 1
  let cursor = latest
  while (byDate.get(shiftDateKey(cursor, -1))) {
    streak += 1
    cursor = shiftDateKey(cursor, -1)
  }
  return streak
}

/** 抽卡次数。基础 1 抽，连续满 14 晚后基础 2 抽；里程碑额外 +1。
 *  门槛定在 14 而非 30：定在 30 时前 37 晚故意断签仍更划算，
 *  降到 14 后交叉点提前至第 16 晚。 */
export function rewardDrawCount(streak: number): number {
  const base = streak >= BASE_DOUBLE_STREAK ? 2 : 1
  const milestone =
    streak === 3 || streak === 7 || streak === 14 || (streak >= 30 && streak % 30 === 0)
  return base + (milestone ? 1 : 0)
}

export function revealWindowOpensAt(ritualDate: string, tz: string): Date {
  const next = shiftDateKey(ritualDate, 1)
  const [y, m, d] = next.split('-').map(Number) as [number, number, number]
  return fromWallClock(y, m, d, REVEAL_HOUR, 0, tz)
}

export function canReveal(input: {
  ritualDate: string; isEligible: boolean; rewardRevealedAt: Date | null; now: Date; tz: string
}): boolean {
  if (!input.isEligible || input.rewardRevealedAt !== null) return false
  return input.now.getTime() >= revealWindowOpensAt(input.ritualDate, input.tz).getTime()
}

export function summarizeCollection(artIds: string[]): CollectionSummary {
  const counts: Record<string, number> = {}
  for (const id of artIds) counts[id] = (counts[id] ?? 0) + 1
  return {
    totalCards: Object.values(counts).reduce((a, b) => a + b, 0),
    uniqueWorks: Object.keys(counts).length,
    counts,
  }
}
```

- [ ] **Step 6: 运行测试，确认 GREEN**

Run: `cd miniprogram && npm test -- src/domain`
Expected: 全部 PASS（47 条契约用例 + 2 条纯度用例）

- [ ] **Step 7: 交叉验证两端一致**

Run:
```bash
cd miniprogram && npm test -- src/domain
cd ../backend && .venv/bin/python -m pytest tests/test_domain_contract.py -q
```
Expected: 两边都全绿。**若只有一边红，说明实现漂移，必须修到两边同绿再继续。**

- [ ] **Step 8: 交付检查**

建议 commit message：
```
feat(miniprogram): 领域纯函数 TS 移植，与后端共用契约

读同一份 shared/ritual-cases.json，两端行为由 47 条用例锁定；
时区通过 Intl 显式解析，不依赖设备本地时区。
```

---

### Task 2: 静态资源流水线与资源基址

原型静态资源约 12MB，小程序主包上限 2MB。除 tabBar 图标外全部走网络。

**Files:**
- Create: `backend/scripts/prepare_ui_assets.py`
- Create: `backend/static/ui/`（产物）
- Modify: `backend/app/schemas/config.py`, `backend/app/api/v1/config.py`
- Modify: `backend/tests/test_config_api.py`
- Create: `backend/tests/test_ui_assets.py`
- Create: `miniprogram/src/assets/tab/`（tabBar PNG）

**Interfaces:**
- Produces: `ConfigResponse.assets: { base_url: string }`
- Produces: `backend/static/ui/{home,prep,quiet,goodnight,dawn}-room.jpg`
- Produces: `backend/static/ui/story-*.jpg`、`backend/static/ui/prologue.mp4`
- Produces: `miniprogram/src/assets/tab/*.png`（16 个）

- [ ] **Step 1: 写后端失败测试**

在 `backend/tests/test_config_api.py` 追加：

```python
async def test_config_exposes_asset_base_url(client):
    """小程序不得硬编码资源域名——由配置下发。"""
    body = (await client.get("/api/v1/config")).json()
    assert body["assets"]["base_url"].startswith("http")


async def test_asset_base_url_matches_settings(client):
    from app.core.config import get_settings
    body = (await client.get("/api/v1/config")).json()
    assert body["assets"]["base_url"] == get_settings().asset_base_url.rstrip("/")
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_config_api.py -q`
Expected: FAIL — `KeyError: 'assets'`

- [ ] **Step 3: 扩展后端配置接口**

在 `backend/app/schemas/config.py` 追加，并改写 `ConfigResponse`：

```python
class AssetsPayload(BaseModel):
    base_url: str


class ConfigResponse(BaseModel):
    schedule: SchedulePayload
    ritual: RitualPayload
    assets: AssetsPayload
```

在 `backend/app/api/v1/config.py` 顶部补 `from app.core.config import get_settings`
与 `from app.schemas.config import AssetsPayload`，并在返回值里加：

```python
        assets=AssetsPayload(base_url=get_settings().asset_base_url.rstrip("/")),
```

- [ ] **Step 4: 运行后端测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_config_api.py -q`
Expected: 6 passed

- [ ] **Step 5: 写资源转换脚本**

`backend/scripts/prepare_ui_assets.py`:

```python
"""把原型资源转换为小程序可用的网络资源与打包图标。

故事序列 4 张 PNG 合计 8.1MB，转 JPG 后可降到 1MB 以内；
tabBar 图标必须是 PNG（微信不支持 SVG）且单个 ≤40KB。
"""
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC_UI = ROOT / "prototype" / "image" / "zhusheng-sleep-ui"
SRC_STORY = ROOT / "prototype" / "image" / "zhusheng-story-sequence"
OUT = ROOT / "backend" / "static" / "ui"
TAB_OUT = ROOT / "miniprogram" / "src" / "assets" / "tab"

ROOMS = ["home-room", "prep-room", "quiet-room", "goodnight-room", "dawn-room"]

NAV_ICONS = [
    ("nav-home-on", "home-on"), ("nav-home-off", "home-off"),
    ("nav-home-off-c", "home-off-c"), ("nav-home-off-s", "home-off-s"),
    ("nav-journal-on", "journal-on"), ("nav-journal-off-dark", "journal-off-dark"),
    ("nav-journal-off-c", "journal-off-c"), ("nav-journal-off-s", "journal-off-s"),
    ("nav-collection-on", "collection-on"), ("nav-collection-off", "collection-off"),
    ("nav-collection-off-dark", "collection-off-dark"),
    ("nav-collection-off-s", "collection-off-s"),
    ("nav-settings-on", "settings-on"), ("nav-settings-off", "settings-off"),
    ("nav-settings-off-dark", "settings-off-dark"),
    ("nav-settings-off-c", "settings-off-c"),
]


def to_jpg(src: Path, dst: Path, max_edge: int, target_kb: int) -> int:
    im = Image.open(src).convert("RGB")
    im.thumbnail((max_edge, max_edge), Image.LANCZOS)
    q = 84
    while True:
        im.save(dst, "JPEG", quality=q, optimize=True, progressive=True)
        if dst.stat().st_size <= target_kb * 1024 or q <= 55:
            return dst.stat().st_size // 1024
        q -= 6


def convert_tab_icons() -> None:
    """SVG → 81×81 PNG。缺 cairosvg 时给出明确指引而非静默失败。"""
    try:
        import cairosvg
    except ImportError as exc:
        raise SystemExit(
            "缺少 cairosvg，无法转换 tabBar 图标。请先 pip install cairosvg，"
            "或用设计工具手动导出 81x81 PNG 到 miniprogram/src/assets/tab/"
        ) from exc

    TAB_OUT.mkdir(parents=True, exist_ok=True)
    for src_name, dst_name in NAV_ICONS:
        dst = TAB_OUT / f"{dst_name}.png"
        cairosvg.svg2png(url=str(SRC_UI / f"{src_name}.svg"), write_to=str(dst),
                         output_width=81, output_height=81)
        size = dst.stat().st_size
        # 用精确字节比较，不要先 //1024——整除会掩盖 40960~41983 字节区间的超标
        assert size <= 40 * 1024, f"{dst_name}.png {size} 字节超过微信 40KB 限制"
    print(f"  tabBar 图标 {len(NAV_ICONS)} 个已转换")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name in ROOMS:
        kb = to_jpg(SRC_UI / f"{name}.jpg", OUT / f"{name}.jpg", 1080, 200)
        print(f"  {name}.jpg  {kb} KB")
        total += kb
    for src in sorted(SRC_STORY.glob("*.png")):
        dst = OUT / f"story-{src.stem.split('-')[0]}.jpg"
        kb = to_jpg(src, dst, 1080, 220)
        print(f"  {dst.name}  {kb} KB")
        total += kb
    shutil.copy2(SRC_UI / "zhusheng-prologue.mp4", OUT / "prologue.mp4")
    mp4_kb = (OUT / "prologue.mp4").stat().st_size // 1024
    print(f"  prologue.mp4  {mp4_kb} KB")
    convert_tab_icons()
    print(f"网络资源合计 {(total + mp4_kb) / 1024:.1f} MB")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: 执行并校验体积**

Run:
```bash
cd backend && .venv/bin/pip install cairosvg && .venv/bin/python -m scripts.prepare_ui_assets
du -sh static/ui ../miniprogram/src/assets/tab
```
Expected: `static/ui` ≤ 5MB；`assets/tab` ≤ 600KB

- [ ] **Step 7: 写体积回归测试**

`backend/tests/test_ui_assets.py`:

```python
from pathlib import Path

STATIC_UI = Path(__file__).resolve().parents[1] / "static" / "ui"
TAB = Path(__file__).resolve().parents[2] / "miniprogram" / "src" / "assets" / "tab"

ROOMS = ["home-room", "prep-room", "quiet-room", "goodnight-room", "dawn-room"]


def test_room_backgrounds_exist_and_small():
    for name in ROOMS:
        p = STATIC_UI / f"{name}.jpg"
        assert p.exists(), f"缺 {p.name}"
        assert p.stat().st_size <= 220 * 1024, f"{p.name} 过大"


def test_story_frames_exist():
    frames = sorted(STATIC_UI.glob("story-*.jpg"))
    assert len(frames) >= 4
    for p in frames:
        assert p.stat().st_size <= 240 * 1024, f"{p.name} 过大"


def test_prologue_video_present():
    assert (STATIC_UI / "prologue.mp4").exists()


def test_tab_icons_within_wechat_limit():
    """微信 tabBar 图标上限 40KB，且不支持 SVG。"""
    icons = list(TAB.glob("*.png"))
    assert len(icons) == 16, f"应有 16 个 tabBar 图标，实际 {len(icons)}"
    for p in icons:
        assert p.stat().st_size <= 40 * 1024, f"{p.name} 超过 40KB"


def test_bundled_assets_fit_main_package():
    """打进主包的资源必须远小于 2MB 上限。"""
    total = sum(p.stat().st_size for p in TAB.glob("*.png"))
    assert total <= 600 * 1024, f"tabBar 图标合计 {total // 1024}KB，主包压力过大"
```

- [ ] **Step 8: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_ui_assets.py tests/test_config_api.py -q`
Expected: 全部 PASS

- [ ] **Step 9: 交付检查**

建议 commit message：
```
feat(assets): 资源流水线与资源基址下发

故事序列 PNG→JPG（8.1MB→<1MB），tabBar 图标 SVG→81px PNG；
/config 下发 asset_base_url，小程序不硬编码域名。
```

---

### Task 3: API 类型与请求客户端

**Files:**
- Create: `miniprogram/src/api/types.ts`, `client.ts`, `endpoints.ts`
- Create: `miniprogram/src/api/__tests__/client.test.ts`
- Create: `miniprogram/src/store/auth.ts`

**Interfaces:**
- Consumes: `API_BASE_URL`（Task 0 的 defineConstants）
- Produces: `type ApiError = { code: string; message: string; detail?: unknown; status: number }`
- Produces: `request<T>(opts: { path: string; method?: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'; data?: unknown; auth?: boolean }): Promise<T>`
- Produces: `setTokens(t: TokenPair): void`、`setAccessToken(s: string): void`、`getAccessToken(): string`、`getRefreshToken(): string`、`clearTokens(): void`
- Produces: `api.{wxLogin,getConfig,getMe,updateNickname,updateSettings,deleteAccount,completeNight,listNights,getNight,editNightText,pendingRewards,revealRewards,getCollection,getArt,postEvents}`

- [ ] **Step 1: 写失败测试**

`miniprogram/src/api/__tests__/client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: Record<string, any> = {}
const calls: any[] = []
const responses: any[] = []
let failNext = false

vi.mock('@tarojs/taro', () => ({
  default: {
    request: (opts: any) => {
      if (failNext) { failNext = false; return Promise.reject(new Error('offline')) }
      calls.push(opts)
      return Promise.resolve(responses.shift() ?? { statusCode: 200, data: {} })
    },
    getStorageSync: (k: string) => store[k] ?? '',
    setStorageSync: (k: string, v: any) => { store[k] = v },
    removeStorageSync: (k: string) => { delete store[k] },
  },
}))

beforeEach(() => { store = {}; calls.length = 0; responses.length = 0; failNext = false })

describe('request', () => {
  it('带上 Authorization 头', async () => {
    const { setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'AAA', refresh_token: 'RRR' })
    responses.push({ statusCode: 200, data: { ok: true } })
    await request({ path: '/api/v1/me' })
    expect(calls[0].header.Authorization).toBe('Bearer AAA')
  })

  it('公开接口不带 Authorization', async () => {
    const { request } = await import('../client')
    responses.push({ statusCode: 200, data: {} })
    await request({ path: '/api/v1/config', auth: false })
    expect(calls[0].header.Authorization).toBeUndefined()
  })

  it('把错误信封抛成 ApiError', async () => {
    const { request } = await import('../client')
    responses.push({ statusCode: 409, data: { code: 'RECORD_LOCKED', message: '已固化' } })
    await expect(request({ path: '/api/v1/nights/2026-08-27', method: 'PATCH' }))
      .rejects.toMatchObject({ code: 'RECORD_LOCKED', status: 409 })
  })

  it('401 时用 refresh_token 换新 access 并重试一次', async () => {
    const { getAccessToken, setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'OLD', refresh_token: 'RRR' })
    responses.push({ statusCode: 401, data: { code: 'TOKEN_INVALID', message: '' } })
    responses.push({ statusCode: 200, data: { access_token: 'NEW' } })
    responses.push({ statusCode: 200, data: { id: 'u1' } })

    const out = await request<{ id: string }>({ path: '/api/v1/me' })
    expect(out.id).toBe('u1')
    expect(getAccessToken()).toBe('NEW')
    expect(calls[2].header.Authorization).toBe('Bearer NEW')
  })

  it('刷新也失败时清空 token 并抛错', async () => {
    const { getAccessToken, setTokens } = await import('@/store/auth')
    const { request } = await import('../client')
    setTokens({ access_token: 'OLD', refresh_token: 'BAD' })
    responses.push({ statusCode: 401, data: { code: 'TOKEN_INVALID', message: '' } })
    responses.push({ statusCode: 401, data: { code: 'TOKEN_INVALID', message: '' } })

    await expect(request({ path: '/api/v1/me' })).rejects.toMatchObject({ status: 401 })
    expect(getAccessToken()).toBe('')
  })

  it('网络失败抛出 NETWORK_UNAVAILABLE', async () => {
    const { request } = await import('../client')
    failNext = true
    await expect(request({ path: '/api/v1/config', auth: false }))
      .rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE', status: 0 })
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/api`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 store/auth.ts**

```ts
import Taro from '@tarojs/taro'

const ACCESS = 'zhusheng-access-token'
const REFRESH = 'zhusheng-refresh-token'

export type TokenPair = { access_token: string; refresh_token: string }

export function setTokens(t: TokenPair): void {
  Taro.setStorageSync(ACCESS, t.access_token)
  Taro.setStorageSync(REFRESH, t.refresh_token)
}

export function setAccessToken(token: string): void {
  Taro.setStorageSync(ACCESS, token)
}

export const getAccessToken = (): string => Taro.getStorageSync(ACCESS) || ''
export const getRefreshToken = (): string => Taro.getStorageSync(REFRESH) || ''

export function clearTokens(): void {
  Taro.removeStorageSync(ACCESS)
  Taro.removeStorageSync(REFRESH)
}
```

- [ ] **Step 4: 实现 api/types.ts**

字段名与后端 OpenAPI 完全一致，**不做驼峰转换**——少一层映射就少一处漂移。

```ts
export type SettingsPayload = {
  bedtime: string        // HH:MM
  wake_time: string
  timezone: string
  reduced_motion: boolean
}

export type MeResponse = {
  id: string
  nickname: string | null
  avatar_url: string | null
  settings: SettingsPayload
}

export type CompleteRequest = {
  completed_at: string   // 带时区偏移的 ISO
  gratitudes: string[]
  plans: string[]
  resistance_reason?: string | null
}

export type CompleteResponse = {
  ritual_date: string
  is_eligible: boolean
  late_minutes: number
  streak: number
}

export type NightSummary = {
  ritual_date: string
  is_eligible: boolean
  late_minutes: number
  completed_at: string
}

export type NightDetail = NightSummary & {
  gratitudes: string[]
  plans: string[]
  resistance_reason: string | null
  text_available: boolean
}

export type ArtBrief = {
  id: string; title: string; artist: string; year: string
  thumbnail: string; image: string; alt: string
}

export type ArtDetail = ArtBrief & { source: string; article: string }

export type RewardItem = { art: ArtBrief; ritual_date: string; awarded_at: string }
export type PendingResponse = { revealable: boolean; ritual_dates: string[] }
export type CollectionItem = { art: ArtBrief; count: number }
export type CollectionResponse = {
  total_cards: number; unique_works: number; items: CollectionItem[]
}

export type ConfigResponse = {
  schedule: { bedtime: string; wake_time: string; min_time: string; max_time: string }
  ritual: {
    tolerance_minutes: number; gratitude_count: number
    plan_count: number; resistance_options: string[]
  }
  assets: { base_url: string }
}

export type EventItem = { type: string; payload: Record<string, unknown>; occurred_at: string }
```

- [ ] **Step 5: 实现 api/client.ts**

```ts
import Taro from '@tarojs/taro'
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from '@/store/auth'

declare const API_BASE_URL: string

export type ApiError = { code: string; message: string; detail?: unknown; status: number }

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

function toApiError(statusCode: number, data: any): ApiError {
  return {
    code: data?.code ?? 'UNKNOWN',
    message: data?.message ?? '请求失败',
    detail: data?.detail,
    status: statusCode,
  }
}

async function raw(path: string, method: Method, data: unknown, token: string) {
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) header.Authorization = `Bearer ${token}`
  try {
    return await Taro.request({ url: `${API_BASE_URL}${path}`, method, data, header })
  } catch {
    // 睡前场景常见飞行模式/弱网。离线完成不在阶段一范围，此处直接告知用户。
    throw { code: 'NETWORK_UNAVAILABLE', message: '网络不可用，请稍后再试', status: 0 } as ApiError
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (!refresh) return false
  const res = await raw('/api/v1/auth/refresh', 'POST', { refresh_token: refresh }, '')
  const token = (res.data as any)?.access_token
  if (res.statusCode === 200 && token) {
    setAccessToken(token)
    return true
  }
  return false
}

export async function request<T>(opts: {
  path: string; method?: Method; data?: unknown; auth?: boolean
}): Promise<T> {
  const { path, method = 'GET', data, auth = true } = opts
  let res = await raw(path, method, data, auth ? getAccessToken() : '')

  if (res.statusCode === 401 && auth) {
    if (await refreshAccessToken()) {
      res = await raw(path, method, data, getAccessToken())   // 只重试一次
    } else {
      clearTokens()
    }
  }

  if (res.statusCode >= 200 && res.statusCode < 300) return res.data as T
  throw toApiError(res.statusCode, res.data)
}
```

- [ ] **Step 6: 实现 api/endpoints.ts**

```ts
import { request } from './client'
import type {
  ArtDetail, CollectionResponse, CompleteRequest, CompleteResponse, ConfigResponse,
  EventItem, MeResponse, NightDetail, NightSummary, PendingResponse, RewardItem,
  SettingsPayload,
} from './types'

export const api = {
  wxLogin: (code: string) =>
    request<{ access_token: string; refresh_token: string }>({
      path: '/api/v1/auth/wx-login', method: 'POST', data: { code }, auth: false }),

  getConfig: () => request<ConfigResponse>({ path: '/api/v1/config', auth: false }),

  getMe: () => request<MeResponse>({ path: '/api/v1/me' }),
  updateNickname: (nickname: string) =>
    request<MeResponse>({ path: '/api/v1/me', method: 'PATCH', data: { nickname } }),
  updateSettings: (s: SettingsPayload) =>
    request<SettingsPayload>({ path: '/api/v1/me/settings', method: 'PUT', data: s }),
  deleteAccount: () => request<void>({ path: '/api/v1/me', method: 'DELETE' }),

  completeNight: (body: CompleteRequest) =>
    request<CompleteResponse>({ path: '/api/v1/nights/complete', method: 'POST', data: body }),
  listNights: () => request<{ items: NightSummary[] }>({ path: '/api/v1/nights' }),
  getNight: (ritualDate: string) =>
    request<NightDetail>({ path: `/api/v1/nights/${ritualDate}` }),
  editNightText: (ritualDate: string, gratitudes: string[], plans: string[]) =>
    request<NightDetail>({
      path: `/api/v1/nights/${ritualDate}`, method: 'PATCH', data: { gratitudes, plans } }),

  pendingRewards: () => request<PendingResponse>({ path: '/api/v1/rewards/pending' }),
  revealRewards: () =>
    request<{ rewards: RewardItem[] }>({ path: '/api/v1/rewards/reveal', method: 'POST' }),

  getCollection: () => request<CollectionResponse>({ path: '/api/v1/collection' }),
  getArt: (id: string) => request<ArtDetail>({ path: `/api/v1/art/${id}` }),

  postEvents: (events: EventItem[]) =>
    request<void>({ path: '/api/v1/events', method: 'POST', data: { events } }),
}
```

- [ ] **Step 7: 运行测试，确认 GREEN**

Run: `cd miniprogram && npm test -- src/api && npm run typecheck`
Expected: 6 passed，类型检查通过

- [ ] **Step 8: 交付检查**

建议 commit message：`feat(miniprogram): API 客户端与类型，含 401 自动刷新`

---

### Task 4: 本地存储与绑定仪式夜的草稿 ★

草稿跨夜残留是原型的真实缺陷（spec 修正 5）：原型把草稿存在全局 key，完成后不清空，
次日打开又恢复到输入框，用户直接完成会存下与前一晚相同的正文。

**Files:**
- Create: `miniprogram/src/store/draft.ts`, `runtime-config.ts`
- Create: `miniprogram/src/store/__tests__/draft.test.ts`
- Create: `miniprogram/src/utils/time.ts`

**Interfaces:**
- Consumes: `currentRitualNight`（Task 1）
- Produces: `type RitualStep = 'resistance' | 'gratitude' | 'plan' | 'prep' | 'quiet'`
- Produces: `type Draft = { ritualNight: string; gratitudes: string[]; plans: string[]; resistanceReason: string | null; step: RitualStep }`
- Produces: `loadDraft(now: Date, tz: string): Draft`、`saveDraft(d: Draft): void`、`clearDraft(): void`
- Produces: `DEFAULT_CONFIG: ConfigResponse`、`loadConfig(): ConfigResponse | null`、`saveConfig(c: ConfigResponse): void`
- Produces: `toIsoWithOffset(d: Date): string`

- [ ] **Step 1: 写失败测试**

`miniprogram/src/store/__tests__/draft.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: Record<string, any> = {}
vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync: (k: string) => store[k] ?? '',
    setStorageSync: (k: string, v: any) => { store[k] = v },
    removeStorageSync: (k: string) => { delete store[k] },
  },
}))

beforeEach(() => { store = {} })

const TZ = 'Asia/Shanghai'

describe('草稿绑定仪式夜', () => {
  it('新草稿带上当前仪式夜', async () => {
    const { loadDraft } = await import('../draft')
    const d = loadDraft(new Date('2026-08-27T22:00:00+08:00'), TZ)
    expect(d.ritualNight).toBe('2026-08-27')
    expect(d.gratitudes).toEqual([])
    expect(d.step).toBe('resistance')
  })

  it('同一仪式夜内草稿保留（凌晨仍属前一晚）', async () => {
    const { loadDraft, saveDraft } = await import('../draft')
    saveDraft({
      ritualNight: '2026-08-27', gratitudes: ['今晚写的'], plans: [],
      resistanceReason: '我还在刷手机', step: 'gratitude',
    })
    const d = loadDraft(new Date('2026-08-28T01:00:00+08:00'), TZ)
    expect(d.gratitudes).toEqual(['今晚写的'])
    expect(d.step).toBe('gratitude')
  })

  it('★ 跨夜后草稿作废，不污染新一晚', async () => {
    const { loadDraft, saveDraft } = await import('../draft')
    saveDraft({
      ritualNight: '2026-08-27', gratitudes: ['昨晚的内容'], plans: ['昨晚的计划'],
      resistanceReason: null, step: 'plan',
    })
    const d = loadDraft(new Date('2026-08-28T22:00:00+08:00'), TZ)
    expect(d.ritualNight).toBe('2026-08-28')
    expect(d.gratitudes).toEqual([])
    expect(d.plans).toEqual([])
    expect(d.step).toBe('resistance')
  })

  it('clearDraft 后重新开始', async () => {
    const { clearDraft, loadDraft, saveDraft } = await import('../draft')
    saveDraft({
      ritualNight: '2026-08-27', gratitudes: ['x'], plans: [],
      resistanceReason: null, step: 'quiet',
    })
    clearDraft()
    expect(loadDraft(new Date('2026-08-27T22:00:00+08:00'), TZ).gratitudes).toEqual([])
  })

  it('存储中的坏数据不致崩溃', async () => {
    store['zhusheng-draft-v1'] = '{ 不是合法 JSON'
    const { loadDraft } = await import('../draft')
    expect(loadDraft(new Date('2026-08-27T22:00:00+08:00'), TZ).gratitudes).toEqual([])
  })
})

describe('toIsoWithOffset', () => {
  it('输出带偏移的 ISO 而非 Z', async () => {
    const { toIsoWithOffset } = await import('@/utils/time')
    const s = toIsoWithOffset(new Date('2026-08-27T23:50:00+08:00'))
    expect(s).toMatch(/[+-]\d{2}:\d{2}$/)
    expect(new Date(s).getTime()).toBe(new Date('2026-08-27T23:50:00+08:00').getTime())
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/store`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 utils/time.ts**

```ts
const pad = (n: number) => String(n).padStart(2, '0')

/** 设备当前时刻 → 带 UTC 偏移的 ISO 字符串。
 *  不用 toISOString()——那会转成 Z，服务端虽仍能正确解析，
 *  但排查问题时看不出用户当时所处的偏移。 */
export function toIsoWithOffset(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}
```

- [ ] **Step 4: 实现 store/draft.ts**

```ts
import Taro from '@tarojs/taro'
import { currentRitualNight } from '@/domain/ritual'

const KEY = 'zhusheng-draft-v1'

export type RitualStep = 'resistance' | 'gratitude' | 'plan' | 'prep' | 'quiet'

export type Draft = {
  /** 所属仪式夜。换夜即作废——原型缺陷，见 spec 修正 5。 */
  ritualNight: string
  gratitudes: string[]
  plans: string[]
  resistanceReason: string | null
  step: RitualStep
}

const empty = (ritualNight: string): Draft => ({
  ritualNight, gratitudes: [], plans: [], resistanceReason: null, step: 'resistance',
})

export function loadDraft(now: Date, tz: string): Draft {
  const night = currentRitualNight(now, tz)
  const raw = Taro.getStorageSync(KEY)
  if (!raw) return empty(night)
  try {
    const d = JSON.parse(raw) as Draft
    if (d?.ritualNight !== night) return empty(night)     // 过夜作废
    return {
      ritualNight: night,
      gratitudes: Array.isArray(d.gratitudes) ? d.gratitudes : [],
      plans: Array.isArray(d.plans) ? d.plans : [],
      resistanceReason: d.resistanceReason ?? null,
      step: d.step ?? 'resistance',
    }
  } catch {
    return empty(night)          // 坏数据不得让页面打不开
  }
}

export function saveDraft(d: Draft): void {
  Taro.setStorageSync(KEY, JSON.stringify(d))
}

export function clearDraft(): void {
  Taro.removeStorageSync(KEY)
}
```

- [ ] **Step 5: 实现 store/runtime-config.ts**

```ts
import Taro from '@tarojs/taro'
import type { ConfigResponse } from '@/api/types'

const KEY = 'zhusheng-config-v1'

/** 拿不到 /config 时的兜底，数值与后端 domain/config.py 保持一致。 */
export const DEFAULT_CONFIG: ConfigResponse = {
  schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
  ritual: {
    tolerance_minutes: 30, gratitude_count: 3, plan_count: 3,
    resistance_options: ['我还在刷手机', '我还在工作', '我还不困', '我舍不得结束今天'],
  },
  assets: { base_url: '' },
}

export function loadConfig(): ConfigResponse | null {
  const raw = Taro.getStorageSync(KEY)
  if (!raw) return null
  try {
    const c = JSON.parse(raw) as ConfigResponse
    // 只挡 JSON.parse 抛错是不够的：合法 JSON 但结构不全（如 `{}`）会让下游
    // 访问 config.ritual.tolerance_minutes 时抛异常，违反「坏数据必须降级」。
    if (!c?.schedule?.bedtime || !c?.ritual || !c?.assets) return null
    if (typeof c.ritual.tolerance_minutes !== 'number') return null
    return c
  } catch {
    return null
  }
}

export function saveConfig(c: ConfigResponse): void {
  Taro.setStorageSync(KEY, JSON.stringify(c))
}
```

- [ ] **Step 6: 运行测试，确认 GREEN**

Run: `cd miniprogram && npm test -- src/store src/utils && npm run typecheck`
Expected: 6 passed

- [ ] **Step 7: 交付检查**

建议 commit message：
```
feat(miniprogram): 绑定仪式夜的本地草稿

修正原型的草稿跨夜残留缺陷：草稿带 ritualNight，换夜自动作废，
不会用昨晚的内容污染今晚的夜记。草稿只存本地，不上传。
```

---

### Task 5: 应用骨架、设计令牌与自定义 tabBar

原型的底部导航在四个页面用四套配色（`-dark` / 无后缀 / `-c` / `-s`），
微信原生 tabBar 只支持一套配色，因此必须自定义。

**Files:**
- Modify: `miniprogram/src/app.config.ts`, `app.scss`
- Create: `miniprogram/src/custom-tab-bar/icons.ts`, `index.tsx`, `index.config.ts`, `index.scss`
- Create: `miniprogram/src/custom-tab-bar/__tests__/tabbar.test.ts`
- Create: `miniprogram/src/components/Screen.tsx`, `Screen.scss`
- Create: `miniprogram/src/pages/{journal,collection,settings}/index.tsx` 与 `index.config.ts`（占位，后续任务填充）

**Interfaces:**
- Consumes: `src/assets/tab/*.png`（Task 2）
- Produces: `type TabKey = 'home' | 'journal' | 'collection' | 'settings'`
- Produces: `TAB_ORDER: TabKey[]`、`TAB_LABEL`、`TAB_PAGE`、`tabIconSet(current: TabKey): Record<TabKey, string>`
- Produces: `<Screen variant="night"|"paper"|"dawn" background? reducedMotion? className?>`

- [ ] **Step 1: 写失败测试**

`miniprogram/src/custom-tab-bar/__tests__/tabbar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TAB_ORDER, tabIconSet } from '../icons'

describe('tabBar 配色', () => {
  it('四个 tab 顺序与原型一致', () => {
    expect(TAB_ORDER).toEqual(['home', 'journal', 'collection', 'settings'])
  })

  it('当前 tab 用选中态图标', () => {
    for (const key of TAB_ORDER) {
      expect(tabIconSet(key)[key]).toContain(`${key}-on`)
    }
  })

  it('首页用深色配色（原型 home 页导航为深色）', () => {
    const set = tabIconSet('home')
    expect(set.journal).toContain('journal-off-dark')
    expect(set.collection).toContain('collection-off-dark')
    expect(set.settings).toContain('settings-off-dark')
  })

  it('收藏页与设置页各用自己的配色变体', () => {
    expect(tabIconSet('collection').home).toContain('home-off-c')
    expect(tabIconSet('settings').home).toContain('home-off-s')
  })

  it('每个配色集合都是四个图标，无缺失', () => {
    for (const key of TAB_ORDER) {
      const set = tabIconSet(key)
      expect(Object.keys(set).sort()).toEqual([...TAB_ORDER].sort())
      for (const v of Object.values(set)) expect(v).toMatch(/\.png$/)
    }
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/custom-tab-bar`
Expected: FAIL — `Cannot find module '../icons'`

- [ ] **Step 3: 实现图标映射**

`miniprogram/src/custom-tab-bar/icons.ts`:

```ts
export type TabKey = 'home' | 'journal' | 'collection' | 'settings'

export const TAB_ORDER: TabKey[] = ['home', 'journal', 'collection', 'settings']

export const TAB_LABEL: Record<TabKey, string> = {
  home: '今晚', journal: '夜记', collection: '收藏', settings: '设置',
}

export const TAB_PAGE: Record<TabKey, string> = {
  home: '/pages/home/index',
  journal: '/pages/journal/index',
  collection: '/pages/collection/index',
  settings: '/pages/settings/index',
}

/** 原型里整排图标随当前页换一套配色，微信原生 tabBar 做不到，故自定义。
 *  后缀含义：-dark 深色的今晚页，-c 收藏页，-s 设置页，无后缀为夜记页。 */
const SUFFIX: Record<TabKey, string> = {
  home: '-off-dark', journal: '-off', collection: '-off-c', settings: '-off-s',
}

const icon = (name: string) => `/assets/tab/${name}.png`

export function tabIconSet(current: TabKey): Record<TabKey, string> {
  const suffix = SUFFIX[current]
  const out = {} as Record<TabKey, string>
  for (const key of TAB_ORDER) {
    out[key] = key === current ? icon(`${key}-on`) : icon(`${key}${suffix}`)
  }
  return out
}
```

- [ ] **Step 4: 实现自定义 tabBar 组件**

`miniprogram/src/custom-tab-bar/index.config.ts`:

```ts
// 当前 Taro 版本的 PageConfig 类型没有 component 字段，tsc 会报错，故断言绕过。
// 功能不受影响：Taro 靠 app.config 的 tabBar.custom + custom-tab-bar 目录名
// 自动识别自定义 tabBar（见 @tarojs/mini-runner 的 MiniPlugin.js），不依赖此字段的类型。
export default definePageConfig({ component: true } as unknown as Parameters<typeof definePageConfig>[0])
```

`miniprogram/src/custom-tab-bar/index.tsx`:

```tsx
import { CoverImage, CoverView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { TAB_LABEL, TAB_ORDER, TAB_PAGE, tabIconSet, type TabKey } from './icons'
import './index.scss'

export default function CustomTabBar() {
  const [current, setCurrent] = useState<TabKey>('home')

  useDidShow(() => {
    const pages = Taro.getCurrentPages()
    const route = pages[pages.length - 1]?.route ?? ''
    const hit = TAB_ORDER.find((k) => TAB_PAGE[k].includes(route))
    if (hit) setCurrent(hit)
  })

  const icons = tabIconSet(current)

  return (
    <CoverView className={`tabbar tabbar--${current}`}>
      {TAB_ORDER.map((key) => (
        <CoverView
          key={key}
          className={`tabbar__item ${key === current ? 'is-active' : ''}`}
          onClick={() => {
            if (key === current) return
            setCurrent(key)
            Taro.switchTab({ url: TAB_PAGE[key] })
          }}
        >
          <CoverImage className="tabbar__icon" src={icons[key]} />
          <CoverView className="tabbar__label">{TAB_LABEL[key]}</CoverView>
        </CoverView>
      ))}
    </CoverView>
  )
}
```

`miniprogram/src/custom-tab-bar/index.scss`:

```scss
.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; height: 110px;
  padding-bottom: env(safe-area-inset-bottom);
  background: rgba(23, 20, 29, 0.94);
  border-top: 1px solid rgba(243, 235, 241, 0.08);

  &--journal, &--collection, &--settings {
    background: rgba(251, 246, 239, 0.96);
    border-top-color: rgba(89, 78, 95, 0.08);
    .tabbar__label { color: var(--paper-ink); }
  }

  &__item {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
  }
  &__icon { width: 44px; height: 44px; margin-bottom: 6px; }
  &__label { font-size: 20px; color: rgba(243, 235, 241, 0.62); }
  &__item.is-active &__label { color: var(--purple-dark); }
}
```

- [ ] **Step 5: 注册页面与 tabBar**

`miniprogram/src/app.config.ts`:

```ts
export default defineAppConfig({
  // ⚠️ pages 只能列**已存在**的页面目录，否则 build:weapp 直接失败。
  // 后续每个任务负责把自己新建的页面加进这个列表：
  //   Task 6 → welcome / guide / story
  //   Task 8 → ritual        Task 9 → goodnight / reward
  //   Task 10 → journal-detail    Task 11 → art-detail
  pages: [
    'pages/home/index',
    'pages/journal/index',
    'pages/collection/index',
    'pages/settings/index',
  ],
  tabBar: {
    custom: true,
    color: '#c9becb',
    selectedColor: '#b9a3cd',
    backgroundColor: '#17141d',
    list: [
      { pagePath: 'pages/home/index', text: '今晚' },
      { pagePath: 'pages/journal/index', text: '夜记' },
      { pagePath: 'pages/collection/index', text: '收藏' },
      { pagePath: 'pages/settings/index', text: '设置' },
    ],
  },
  window: {
    backgroundTextStyle: 'dark',
    navigationStyle: 'custom',
    backgroundColor: '#17141d',
  },
})
```

> `tabBar.list` 即使自定义也必须声明——微信用它决定哪些页面是 tab 页、
> `switchTab` 才能跳转。图标字段可省略，由自定义组件渲染。

- [ ] **Step 6: 写设计令牌与页面容器**

`miniprogram/src/app.scss`（令牌**逐值取自** `prototype/zhusheng-sleep-figma.html` 的 `:root`，已逐个 grep 核对）:

```scss
page {
  /* ── 纸屏（夜记 / 收藏 / 设置）：原型亮色主题 ────────────── */
  --paper: #fbf6ef;          /* 原型 :root --paper */
  --paper-2: var(--white);        /* 原型 :root --paper-2 */
  --paper-ink: var(--paper-ink);      /* 原型 :root --ink */
  --paper-muted: #716575;    /* 原型 :root --muted */

  /* ── 夜屏（今晚 / 仪式 / 晚安）：原型暗色主题 ──────────────── */
  --night: var(--night);          /* 原型暗色 html,body background */
  --night-2: #2b2440;        /* 原型 :root --night */
  --night-ink: var(--night-ink);      /* 原型暗色 --ink */
  --night-muted: #c9becb;    /* 原型暗色 --muted */

  /* ── 强调色与装饰：原型的紫/薰衣草系 ─────────────────────── */
  --purple: var(--purple);         /* 原型亮色 --purple，纸屏强调 */
  --purple-dark: var(--purple-dark);    /* 原型暗色 --purple，夜屏强调 */
  --lav: #ddd7f1;            /* 原型 --lav */
  --pink: #f2d5e3;           /* 原型 --pink */
  --line: #dcc7d2;           /* 原型亮色 --line */
  --line-dark: #655a69;      /* 原型暗色 --line */
  --white: var(--white);          /* 原型 --white */

  --shadow: 0 12px 30px rgba(64, 41, 77, .12);   /* 原型 --shadow */
  --ease: cubic-bezier(.22, .74, .24, 1);        /* 原型 --ease */

  background: var(--night);
  color: var(--night-ink);
  /* 原型正文字体；标题另用 "Noto Serif SC", serif */
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
}
```

> ⚠️ 这套值是从原型逐个 grep 出来的，**不要改**。计划初版曾用一套凭空编造的
> 「深藏青 + 烛金」（`#17141d` / `#b9a3cd`），那些色值在原型里一次都没出现过。

`miniprogram/src/components/Screen.tsx`:

```tsx
import { View } from '@tarojs/components'
import type { PropsWithChildren } from 'react'
import './Screen.scss'

type Props = PropsWithChildren<{
  variant?: 'night' | 'paper' | 'dawn'
  background?: string          // 网络图 URL，来自 assets.base_url
  reducedMotion?: boolean
  className?: string
}>

export default function Screen({
  variant = 'night', background, reducedMotion = false, children, className = '',
}: Props) {
  const style = background ? { backgroundImage: `url(${background})` } : undefined
  return (
    <View
      className={`screen screen--${variant} ${reducedMotion ? 'screen--still' : ''} ${className}`}
      style={style}
    >
      <View className="screen__inner">{children}</View>
    </View>
  )
}
```

`miniprogram/src/components/Screen.scss`:

```scss
.screen {
  min-height: 100vh;
  background-size: cover;
  background-position: center;
  padding-top: env(safe-area-inset-top);
  padding-bottom: calc(110px + env(safe-area-inset-bottom));

  &--paper { background-color: var(--paper); color: var(--paper-ink); }
  &--dawn  { background-color: var(--dawn); }

  &__inner { padding: 48px 40px; }

  &--still * { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 7: 建四个 tab 页占位**

`pages/journal/index.tsx`、`pages/collection/index.tsx`、`pages/settings/index.tsx`
各写一个最小组件（后续任务填充），并各配一份
`index.config.ts`：`export default definePageConfig({ navigationStyle: 'custom' })`。

```tsx
// pages/journal/index.tsx（collection / settings 同构，改文字即可）
import { Text } from '@tarojs/components'
import Screen from '@/components/Screen'

export default function Journal() {
  return <Screen variant="paper"><Text>夜记</Text></Screen>
}
```

- [ ] **Step 8: 运行测试与构建，确认 GREEN**

Run: `cd miniprogram && npm test -- src/custom-tab-bar && npm run typecheck && npm run build:weapp`
Expected: 5 passed；构建成功

- [ ] **Step 9: 在开发者工具中人工确认**

导入 `miniprogram/dist`，勾选「不校验合法域名」。确认四个 tab 可切换，
且切到不同 tab 时**整排图标配色随之改变**——这是原生 tabBar 做不到、本任务存在的理由。

- [ ] **Step 10: 交付检查**

建议 commit message：
```
feat(miniprogram): 应用骨架、设计令牌与自定义 tabBar

原型的导航在四个页面用四套配色，原生 tabBar 只支持一套，故自定义。
```

---

### Task 6: 启动流程、欢迎、引导与开场

> ⚠️ **本任务必须把新建的页面（welcome / guide / story）加进 `src/app.config.ts` 的 `pages` 数组**，
> 否则页面无法跳转。`pages` 里不能出现尚不存在的目录，否则 `build:weapp` 会失败。

**Files:**
- Modify: `miniprogram/src/app.tsx`
- Create: `miniprogram/src/store/session.ts`
- Create: `miniprogram/src/store/__tests__/bootstrap.test.ts`
- Create: `miniprogram/src/pages/welcome/index.tsx`, `index.config.ts`, `index.scss`
- Create: `miniprogram/src/pages/guide/index.tsx`, `index.config.ts`, `index.scss`
- Create: `miniprogram/src/pages/story/index.tsx`, `index.config.ts`, `index.scss`

**Interfaces:**
- Consumes: `api.wxLogin`、`api.getConfig`、`api.getMe`（Task 3）；`saveConfig`（Task 4）
- Produces: `bootstrap(): Promise<{ config: ConfigResponse; me: MeResponse }>`
- Produces: `isOnboarded(): boolean`、`markOnboarded(): void`

- [ ] **Step 1: 写失败测试**

`miniprogram/src/store/__tests__/bootstrap.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: Record<string, any> = {}
const loginCalls: string[] = []

vi.mock('@tarojs/taro', () => ({
  default: {
    login: () => { loginCalls.push('login'); return Promise.resolve({ code: 'CODE123' }) },
    getStorageSync: (k: string) => store[k] ?? '',
    setStorageSync: (k: string, v: any) => { store[k] = v },
    removeStorageSync: (k: string) => { delete store[k] },
  },
}))

const apiMock = {
  wxLogin: vi.fn(async () => ({ access_token: 'A', refresh_token: 'R' })),
  getConfig: vi.fn(async () => ({
    schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
    ritual: { tolerance_minutes: 30, gratitude_count: 3, plan_count: 3, resistance_options: [] },
    assets: { base_url: 'https://cdn.example' },
  })),
  getMe: vi.fn(async () => ({
    id: 'u1', nickname: null, avatar_url: null,
    settings: {
      bedtime: '23:30', wake_time: '07:30', timezone: 'Asia/Shanghai', reduced_motion: false,
    },
  })),
}
vi.mock('@/api/endpoints', () => ({ api: apiMock }))

beforeEach(() => {
  store = {}
  loginCalls.length = 0
  Object.values(apiMock).forEach((f) => f.mockClear())
})

describe('bootstrap', () => {
  it('无 token 时静默登录并缓存配置', async () => {
    const { bootstrap } = await import('../session')
    const out = await bootstrap()
    expect(loginCalls).toHaveLength(1)
    expect(apiMock.wxLogin).toHaveBeenCalledWith('CODE123')
    expect(out.config.assets.base_url).toBe('https://cdn.example')
    expect(store['zhusheng-config-v1']).toBeTruthy()
  })

  it('已有 token 时不重复登录', async () => {
    store['zhusheng-access-token'] = 'EXISTING'
    const { bootstrap } = await import('../session')
    await bootstrap()
    expect(loginCalls).toHaveLength(0)
  })

  it('引导状态可持久化', async () => {
    const { isOnboarded, markOnboarded } = await import('../session')
    expect(isOnboarded()).toBe(false)
    markOnboarded()
    expect(isOnboarded()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/store/__tests__/bootstrap.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 store/session.ts**

```ts
import Taro from '@tarojs/taro'
import { api } from '@/api/endpoints'
import type { ConfigResponse, MeResponse } from '@/api/types'
import { getAccessToken, setTokens } from './auth'
import { saveConfig } from './runtime-config'

const ONBOARDED = 'zhusheng-onboarded-v1'

export const isOnboarded = (): boolean => Taro.getStorageSync(ONBOARDED) === 'true'
export const markOnboarded = (): void => Taro.setStorageSync(ONBOARDED, 'true')

/** 静默登录 + 拉取配置与用户设置。用户全程无感，延续「不强制登录」的原则。 */
export async function bootstrap(): Promise<{ config: ConfigResponse; me: MeResponse }> {
  if (!getAccessToken()) {
    const { code } = await Taro.login()
    setTokens(await api.wxLogin(code))
  }
  const [config, me] = await Promise.all([api.getConfig(), api.getMe()])
  saveConfig(config)
  return { config, me }
}
```

- [ ] **Step 4: 实现欢迎页**

`miniprogram/src/pages/welcome/index.config.ts`（guide / story 同）:

```ts
export default definePageConfig({ navigationStyle: 'custom' })
```

`miniprogram/src/pages/welcome/index.tsx`:

```tsx
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import Screen from '@/components/Screen'
import './index.scss'

export default function Welcome() {
  return (
    <Screen variant="night" className="welcome">
      <View className="welcome__mark">烛生</View>
      <Text className="welcome__slogan">陪你按时睡觉</Text>
      <Text className="welcome__note">
        不需要注册，也不会打扰你。今晚开始，给一天一个明确的收尾。
      </Text>
      <Button
        className="welcome__cta"
        onClick={() => Taro.navigateTo({ url: '/pages/guide/index' })}
      >
        开始
      </Button>
    </Screen>
  )
}
```

`miniprogram/src/pages/welcome/index.scss`:

```scss
.welcome {
  &__mark { font-size: 64px; letter-spacing: 12px; color: var(--purple-dark); margin-bottom: 24px; }
  &__slogan { display: block; font-size: 34px; margin-bottom: 40px; }
  &__note { display: block; font-size: 26px; line-height: 1.8; color: var(--night-muted); }
  &__cta {
    margin-top: 80px; background: var(--purple-dark); color: var(--white);
    border-radius: 999px; font-size: 30px;
  }
}
```

- [ ] **Step 5: 实现三步引导页**

对应原型的 guide-rest / guide-light / guide-gift，一页内部步进。

`miniprogram/src/pages/guide/index.tsx`:

```tsx
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import Screen from '@/components/Screen'
import { markOnboarded } from '@/store/session'
import './index.scss'

const STEPS = [
  { key: 'rest', title: '先把今天放下', body: '睡前有一段固定的仪式，身体会记住什么时候该停下来。' },
  { key: 'light', title: '让光安静下来', body: '到点后画面会自己暗下去，你不需要再做决定。' },
  { key: 'gift', title: '第二天早上有份礼物', body: '按时熄灯的夜晚，清晨会收到一幅安静的艺术作品。' },
]

export default function Guide() {
  const [i, setI] = useState(0)
  const step = STEPS[i]!
  const last = i === STEPS.length - 1

  return (
    <Screen variant="night" className="guide">
      <View className="guide__dots">
        {STEPS.map((s, n) => (
          <View key={s.key} className={`guide__dot ${n === i ? 'is-on' : ''}`} />
        ))}
      </View>
      <Text className="guide__title">{step.title}</Text>
      <Text className="guide__body">{step.body}</Text>
      <Button
        className="guide__cta"
        onClick={() => {
          if (!last) return setI(i + 1)
          markOnboarded()
          Taro.redirectTo({ url: '/pages/story/index' })
        }}
      >
        {last ? '进入' : '继续'}
      </Button>
    </Screen>
  )
}
```

`miniprogram/src/pages/guide/index.scss`:

```scss
.guide {
  &__dots { display: flex; gap: 12px; margin-bottom: 64px; }
  &__dot {
    width: 40px; height: 4px; border-radius: 2px;
    background: rgba(243, 235, 241, 0.2);
    &.is-on { background: var(--purple-dark); }
  }
  &__title { display: block; font-size: 40px; margin-bottom: 28px; }
  &__body { display: block; font-size: 28px; line-height: 1.9; color: var(--night-muted); }
  &__cta {
    margin-top: 96px; background: transparent; color: var(--purple-dark);
    border: 1px solid var(--purple-dark); border-radius: 999px; font-size: 28px;
  }
}
```

- [ ] **Step 6: 实现开场视频页**

`miniprogram/src/pages/story/index.tsx`:

```tsx
import { CoverView, Video } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import Screen from '@/components/Screen'
import { DEFAULT_CONFIG, loadConfig } from '@/store/runtime-config'
import './index.scss'

export default function Story() {
  const [base, setBase] = useState('')

  useEffect(() => {
    setBase((loadConfig() ?? DEFAULT_CONFIG).assets.base_url)
  }, [])

  const enter = () => Taro.switchTab({ url: '/pages/home/index' })

  return (
    <Screen variant="dawn" className="story">
      {base ? (
        <Video
          className="story__video"
          src={`${base}/ui/prologue.mp4`}
          autoplay
          controls={false}
          showCenterPlayBtn={false}
          objectFit="cover"
          onEnded={enter}
          onError={enter}          // 取不到视频时不能把用户卡住
        />
      ) : null}
      {/* 视频是原生组件，层级高于普通元素；「跳过」必须用 CoverView 才压得住 */}
      <CoverView className="story__skip" onClick={enter}>跳过</CoverView>
    </Screen>
  )
}
```

`miniprogram/src/pages/story/index.scss`:

```scss
.story {
  position: relative;
  .screen__inner { padding: 0; }
  &__video { width: 100%; height: 100vh; }
  &__skip {
    position: absolute; right: 40px; top: calc(env(safe-area-inset-top) + 40px);
    font-size: 26px; color: rgba(243, 235, 241, 0.85);
    padding: 12px 28px; border-radius: 999px;
    background: rgba(0, 0, 0, 0.4);
  }
}
```

- [ ] **Step 7: 在 app.tsx 接入启动流程**

```tsx
import Taro from '@tarojs/taro'
import { useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import { bootstrap, isOnboarded } from '@/store/session'
import './app.scss'

export default function App({ children }: PropsWithChildren) {
  useEffect(() => {
    bootstrap()
      .then(() => {
        if (!isOnboarded()) Taro.reLaunch({ url: '/pages/welcome/index' })
      })
      .catch(() => {
        Taro.showToast({ title: '网络不可用', icon: 'none' })
      })
  }, [])

  return <>{children}</>
}
```

- [ ] **Step 8: 运行测试与构建，确认 GREEN**

Run: `cd miniprogram && npm test && npm run typecheck && npm run build:weapp`
Expected: 全部 PASS，构建成功

- [ ] **Step 9: 交付检查**

建议 commit message：`feat(miniprogram): 静默登录、欢迎、三步引导与开场`

---

### Task 7: 今晚页（倒计时与状态相位）

端上唯一必须实时计算的地方——每秒刷新，不可能调 API。

**Files:**
- Create: `miniprogram/src/components/countdown-state.ts`, `Countdown.tsx`, `Countdown.scss`
- Create: `miniprogram/src/components/__tests__/countdown.test.ts`
- Modify: `miniprogram/src/pages/home/index.tsx`
- Create: `miniprogram/src/pages/home/index.scss`

**Interfaces:**
- Consumes: `evaluateCompletion`、`currentRitualNight`、`calculateOnTimeStreak`（Task 1）；`api.getMe`、`api.listNights`（Task 3）
- Produces: `type Phase = 'prepare' | 'near' | 'sleep'`
- Produces: `countdownState(now: Date, bedtime: string, tz: string): { seconds: number; late: number; phase: Phase }`
- Produces: `formatClock(sec: number): string`

- [ ] **Step 1: 写失败测试**

`miniprogram/src/components/__tests__/countdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { countdownState, formatClock } from '../countdown-state'

const TZ = 'Asia/Shanghai'

describe('countdownState', () => {
  it('距离入睡尚早：prepare 相位', () => {
    const s = countdownState(new Date('2026-08-27T21:00:00+08:00'), '23:30', TZ)
    expect(s.phase).toBe('prepare')
    expect(s.seconds).toBe(150 * 60)
    expect(s.late).toBe(0)
  })

  it('十分钟内：near 相位', () => {
    const s = countdownState(new Date('2026-08-27T23:25:00+08:00'), '23:30', TZ)
    expect(s.phase).toBe('near')
    expect(s.seconds).toBe(5 * 60)
  })

  it('已过点：sleep 相位并给出迟到秒数', () => {
    const s = countdownState(new Date('2026-08-27T23:50:00+08:00'), '23:30', TZ)
    expect(s.phase).toBe('sleep')
    expect(s.seconds).toBe(0)
    expect(s.late).toBe(20 * 60)
  })

  it('凌晨计划时间不会算成整整一天之后', () => {
    const s = countdownState(new Date('2026-08-28T00:10:00+08:00'), '00:30', TZ)
    expect(s.phase).toBe('near')
    expect(s.seconds).toBe(20 * 60)
  })

  it('以用户时区为准，与设备时区无关', () => {
    const s = countdownState(new Date('2026-08-27T23:25:00+08:00'), '23:30', TZ)
    expect(s.seconds).toBe(5 * 60)
  })
})

describe('formatClock', () => {
  it('补零到两位并用空格分隔', () => {
    expect(formatClock(3661)).toBe('01 : 01 : 01')
    expect(formatClock(0)).toBe('00 : 00 : 00')
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/components`
Expected: FAIL — `Cannot find module '../countdown-state'`

- [ ] **Step 3: 实现 countdown-state.ts**

```ts
import { evaluateCompletion } from '@/domain/ritual'

export type Phase = 'prepare' | 'near' | 'sleep'

const NEAR_SECONDS = 10 * 60

/** 复用 domain 的计划时刻解析逻辑，避免此处再写一份跨午夜规则。
 *  容差与窗口给成不影响 plannedAt 计算的值——这里只要 plannedAt。 */
export function countdownState(now: Date, bedtime: string, tz: string) {
  const { plannedAt } = evaluateCompletion({
    plannedTime: bedtime, completedAt: now, tz,
    toleranceMinutes: 0, minTime: '00:00', maxTime: '23:59',
  })
  const delta = Math.floor((plannedAt.getTime() - now.getTime()) / 1000)

  if (delta <= 0) return { seconds: 0, late: -delta, phase: 'sleep' as Phase }
  return {
    seconds: delta,
    late: 0,
    phase: (delta <= NEAR_SECONDS ? 'near' : 'prepare') as Phase,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [h, m, s].map(pad).join(' : ')
}
```

- [ ] **Step 4: 实现 Countdown 组件**

`miniprogram/src/components/Countdown.tsx`:

```tsx
import { Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { countdownState, formatClock, type Phase } from './countdown-state'
import './Countdown.scss'

type Props = { bedtime: string; tz: string; onPhase?: (p: Phase) => void }

export default function Countdown({ bedtime, tz, onPhase }: Props) {
  const [state, setState] = useState(() => countdownState(new Date(), bedtime, tz))

  useEffect(() => {
    const tick = () => {
      const next = countdownState(new Date(), bedtime, tz)
      setState(next)
      onPhase?.(next.phase)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [bedtime, tz, onPhase])

  const late = state.late > 0
  return (
    <View className={`countdown countdown--${state.phase}`}>
      <Text className="countdown__label">{late ? '比计划晚了' : '距离入睡'}</Text>
      <Text className="countdown__value">{formatClock(late ? state.late : state.seconds)}</Text>
    </View>
  )
}
```

`miniprogram/src/components/Countdown.scss`:

```scss
.countdown {
  &__label { display: block; font-size: 26px; color: var(--night-muted); margin-bottom: 16px; }
  &__value {
    display: block; font-size: 72px; letter-spacing: 2px;
    font-variant-numeric: tabular-nums; color: var(--night-ink);
  }
  &--near &__value { color: var(--purple-dark); }
  &--sleep &__value { color: var(--purple-dark); }
}
```

- [ ] **Step 5: 实现今晚页**

`miniprogram/src/pages/home/index.tsx`:

```tsx
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '@/api/endpoints'
import type { MeResponse } from '@/api/types'
import Countdown from '@/components/Countdown'
import Screen from '@/components/Screen'
import { calculateOnTimeStreak, currentRitualNight } from '@/domain/ritual'
import { DEFAULT_CONFIG, loadConfig } from '@/store/runtime-config'
import './index.scss'

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [streak, setStreak] = useState(0)
  const config = loadConfig() ?? DEFAULT_CONFIG

  useDidShow(() => {
    Promise.all([api.getMe(), api.listNights()])
      .then(([m, nights]) => {
        setMe(m)
        const records = nights.items.map(
          (n) => [n.ritual_date, n.is_eligible] as [string, boolean])
        setStreak(calculateOnTimeStreak(
          records, currentRitualNight(new Date(), m.settings.timezone)))
      })
      .catch(() => Taro.showToast({ title: '网络不可用', icon: 'none' }))
  })

  if (!me) return <Screen variant="night" className="home" />

  return (
    <Screen
      variant="night"
      background={`${config.assets.base_url}/ui/home-room.jpg`}
      reducedMotion={me.settings.reduced_motion}
      className="home"
    >
      <Text className="home__question">今晚，几点睡？</Text>
      <Countdown bedtime={me.settings.bedtime} tz={me.settings.timezone} />
      <View className="home__meta">
        <Text className="home__streak">连续按时 {streak} 晚</Text>
        <Text className="home__wake">明早 {me.settings.wake_time} 醒来</Text>
      </View>
      <Button
        className="home__cta"
        onClick={() => Taro.navigateTo({ url: '/pages/ritual/index' })}
      >
        开始今晚的仪式
      </Button>
    </Screen>
  )
}
```

`miniprogram/src/pages/home/index.scss`:

```scss
.home {
  &__question { display: block; font-size: 34px; margin-bottom: 48px; }
  &__meta { display: flex; gap: 32px; margin-top: 40px; }
  &__streak, &__wake { font-size: 26px; color: var(--night-muted); }
  &__cta {
    margin-top: 96px; background: var(--purple-dark); color: var(--white);
    border-radius: 999px; font-size: 30px;
  }
}
```

- [ ] **Step 6: 运行测试，确认 GREEN**

Run: `cd miniprogram && npm test -- src/components && npm run typecheck`
Expected: 6 passed

- [ ] **Step 7: 交付检查**

建议 commit message：`feat(miniprogram): 今晚页倒计时与状态相位`

---

### Task 8: 仪式流程页与断点续做

> ⚠️ **本任务必须把新建的页面（ritual）加进 `src/app.config.ts` 的 `pages` 数组**，
> 否则页面无法跳转。`pages` 里不能出现尚不存在的目录，否则 `build:weapp` 会失败。

对应原型的 resistance → gratitude → plan → prep → quiet 五步。
一页内部步进而非五个页面：小程序导航栈有深度限制，且断点续做在单页内最直接。

**Files:**
- Create: `miniprogram/src/pages/ritual/steps.ts`, `index.tsx`, `index.config.ts`, `index.scss`
- Create: `miniprogram/src/pages/ritual/__tests__/steps.test.ts`

**Interfaces:**
- Consumes: `loadDraft`、`saveDraft`、`clearDraft`、`Draft`、`RitualStep`（Task 4）；`api.completeNight`、`api.getMe`（Task 3）；`toIsoWithOffset`（Task 4）
- Produces: `RITUAL_STEPS: RitualStep[]`、`STEP_TITLE: Record<RitualStep, string>`
- Produces: `nextStep(s: RitualStep): RitualStep | null`、`prevStep(s: RitualStep): RitualStep | null`
- Produces: `canAdvance(step: RitualStep, draft: Draft): boolean`

- [ ] **Step 1: 写失败测试**

`miniprogram/src/pages/ritual/__tests__/steps.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Draft } from '@/store/draft'
import { RITUAL_STEPS, canAdvance, nextStep, prevStep } from '../steps'

const draft = (over: Partial<Draft> = {}): Draft => ({
  ritualNight: '2026-08-27', gratitudes: [], plans: [],
  resistanceReason: null, step: 'resistance', ...over,
})

describe('步骤顺序', () => {
  it('五步顺序与原型一致', () => {
    expect(RITUAL_STEPS).toEqual(['resistance', 'gratitude', 'plan', 'prep', 'quiet'])
  })

  it('首尾边界返回 null', () => {
    expect(prevStep('resistance')).toBeNull()
    expect(nextStep('quiet')).toBeNull()
    expect(nextStep('resistance')).toBe('gratitude')
    expect(prevStep('plan')).toBe('gratitude')
  })
})

describe('canAdvance', () => {
  it('阻力步必须选一个原因', () => {
    expect(canAdvance('resistance', draft())).toBe(false)
    expect(canAdvance('resistance', draft({ resistanceReason: '我还在刷手机' }))).toBe(true)
  })

  it('感恩步至少写一条', () => {
    expect(canAdvance('gratitude', draft())).toBe(false)
    expect(canAdvance('gratitude', draft({ gratitudes: ['阳光'] }))).toBe(true)
  })

  it('计划步至少写一条', () => {
    expect(canAdvance('plan', draft({ gratitudes: ['x'] }))).toBe(false)
    expect(canAdvance('plan', draft({ gratitudes: ['x'], plans: ['早起'] }))).toBe(true)
  })

  it('准备与安静步无输入要求', () => {
    expect(canAdvance('prep', draft())).toBe(true)
    expect(canAdvance('quiet', draft())).toBe(true)
  })

  it('空白字符不算有效输入', () => {
    expect(canAdvance('gratitude', draft({ gratitudes: ['   '] }))).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/pages/ritual`
Expected: FAIL — `Cannot find module '../steps'`

- [ ] **Step 3: 实现 steps.ts**

```ts
import type { Draft, RitualStep } from '@/store/draft'

export const RITUAL_STEPS: RitualStep[] = ['resistance', 'gratitude', 'plan', 'prep', 'quiet']

export const STEP_TITLE: Record<RitualStep, string> = {
  resistance: '此刻是什么在拦着你',
  gratitude: '今天有什么值得谢谢',
  plan: '明天最想做的三件事',
  prep: '把光调暗一点',
  quiet: '安静下来',
}

export function nextStep(s: RitualStep): RitualStep | null {
  const i = RITUAL_STEPS.indexOf(s)
  return i >= 0 && i < RITUAL_STEPS.length - 1 ? RITUAL_STEPS[i + 1]! : null
}

export function prevStep(s: RitualStep): RitualStep | null {
  const i = RITUAL_STEPS.indexOf(s)
  return i > 0 ? RITUAL_STEPS[i - 1]! : null
}

const nonEmpty = (xs: string[]) => xs.filter((x) => x.trim().length > 0)

export function canAdvance(step: RitualStep, draft: Draft): boolean {
  switch (step) {
    case 'resistance': return Boolean(draft.resistanceReason)
    case 'gratitude': return nonEmpty(draft.gratitudes).length > 0
    case 'plan': return nonEmpty(draft.plans).length > 0
    default: return true
  }
}
```

- [ ] **Step 4: 实现仪式流程页**

`miniprogram/src/pages/ritual/index.tsx`:

```tsx
import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import Screen from '@/components/Screen'
import { clearDraft, loadDraft, saveDraft, type Draft, type RitualStep } from '@/store/draft'
import { DEFAULT_CONFIG, loadConfig } from '@/store/runtime-config'
import { toIsoWithOffset } from '@/utils/time'
import { STEP_TITLE, canAdvance, nextStep, prevStep } from './steps'
import './index.scss'

const BACKGROUND: Partial<Record<RitualStep, string>> = {
  prep: 'ui/prep-room.jpg',
  quiet: 'ui/quiet-room.jpg',
}

export default function Ritual() {
  const cfg = loadConfig() ?? DEFAULT_CONFIG
  const [tz, setTz] = useState('Asia/Shanghai')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getMe()
      .then((me) => {
        setTz(me.settings.timezone)
        setDraft(loadDraft(new Date(), me.settings.timezone))   // 断点续做，跨夜自动作废
      })
      .catch(() => {
        setTz('Asia/Shanghai')
        setDraft(loadDraft(new Date(), 'Asia/Shanghai'))
      })
  }, [])

  if (!draft) return <Screen variant="night" />

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    saveDraft(next)
  }

  // 三个输入框同时渲染，用户可能先填第 2 个再填第 1 个。
  // 若用 `[...list]; next[i] = v` 会留下数组空洞，JSON.stringify 把空洞变成 null，
  // 下次 loadDraft 读回后 nonEmpty 对 null 调 .trim() 直接抛 TypeError——
  // 断点续做重开页面就白屏。这里补齐到目标下标，保证草稿里始终是稠密字符串数组。
  const setListItem = (list: string[], index: number, value: string): string[] => {
    const next = Array.from({ length: Math.max(list.length, index + 1) }, (_, i) => list[i] ?? '')
    next[index] = value
    return next
  }

  const finish = async () => {
    setBusy(true)
    try {
      const res = await api.completeNight({
        completed_at: toIsoWithOffset(new Date()),
        gratitudes: draft.gratitudes.filter((x) => x.trim()),
        plans: draft.plans.filter((x) => x.trim()),
        resistance_reason: draft.resistanceReason,
      })
      clearDraft()
      Taro.redirectTo({
        url: `/pages/goodnight/index?ritual_date=${res.ritual_date}` +
             `&eligible=${res.is_eligible ? 1 : 0}&streak=${res.streak}`,
      })
    } catch (e) {
      const err = e as ApiError
      // 离线完成不支持——如实告知，不假装成功
      Taro.showToast({
        title: err.code === 'NETWORK_UNAVAILABLE' ? '网络不可用，仪式未记录' : err.message,
        icon: 'none', duration: 2500,
      })
    } finally {
      setBusy(false)
    }
  }

  const advance = () => {
    const n = nextStep(draft.step)
    if (n) return update({ step: n })
    void finish()
  }

  const bg = BACKGROUND[draft.step]
  const ready = canAdvance(draft.step, draft)
  const isWriting = draft.step === 'gratitude' || draft.step === 'plan'
  const list = draft.step === 'gratitude' ? draft.gratitudes : draft.plans
  const count = draft.step === 'gratitude' ? cfg.ritual.gratitude_count : cfg.ritual.plan_count

  return (
    <Screen
      variant={draft.step === 'quiet' ? 'dawn' : 'night'}
      background={bg ? `${cfg.assets.base_url}/${bg}` : undefined}
      className={`ritual ritual--${draft.step}`}
    >
      <Text className="ritual__title">{STEP_TITLE[draft.step]}</Text>

      {draft.step === 'resistance' && (
        <View className="ritual__options">
          {cfg.ritual.resistance_options.map((opt) => (
            <View
              key={opt}
              className={`ritual__option ${draft.resistanceReason === opt ? 'is-on' : ''}`}
              onClick={() => update({ resistanceReason: opt })}
            >
              {opt}
            </View>
          ))}
        </View>
      )}

      {isWriting && (
        <View className="ritual__inputs">
          {Array.from({ length: count }).map((_, i) => (
            <Input
              key={i}
              className="ritual__input"
              value={list[i] ?? ''}
              placeholder={`第 ${i + 1} 件`}
              onInput={(e) => {
                const next = setListItem(list, i, e.detail.value)
                update(draft.step === 'gratitude' ? { gratitudes: next } : { plans: next })
              }}
            />
          ))}
        </View>
      )}

      {draft.step === 'prep' && (
        <Text className="ritual__body">把屏幕调暗，让房间安静下来。剩下的交给时间。</Text>
      )}
      {draft.step === 'quiet' && (
        <Text className="ritual__body">灯关掉，躺好。准备好了就点下面的熄灯。</Text>
      )}

      <View className="ritual__actions">
        {prevStep(draft.step) && (
          <Text className="ritual__back" onClick={() => update({ step: prevStep(draft.step)! })}>
            返回
          </Text>
        )}
        <Button className="ritual__next" disabled={!ready || busy} onClick={advance}>
          {draft.step === 'quiet' ? '熄灯' : '继续'}
        </Button>
      </View>
    </Screen>
  )
}
```

`miniprogram/src/pages/ritual/index.scss`:

```scss
.ritual {
  &__title { display: block; font-size: 38px; margin-bottom: 56px; }
  &__options { display: flex; flex-direction: column; gap: 20px; }
  &__option {
    padding: 28px 32px; border-radius: 20px; font-size: 30px;
    border: 1px solid rgba(243, 235, 241, 0.16);
    &.is-on { border-color: var(--purple-dark); color: var(--purple-dark); }
  }
  &__inputs { display: flex; flex-direction: column; gap: 24px; }
  &__input {
    padding: 26px 0; font-size: 30px; color: var(--night-ink);
    border-bottom: 1px solid rgba(243, 235, 241, 0.16);
  }
  &__body { display: block; font-size: 30px; line-height: 1.9; color: var(--night-muted); }
  &__actions { margin-top: 96px; display: flex; align-items: center; gap: 32px; }
  &__back { font-size: 28px; color: var(--night-muted); }
  &__next {
    flex: 1; background: var(--purple-dark); color: var(--white);
    border-radius: 999px; font-size: 30px;
    &[disabled] { opacity: 0.4; }
  }
}
```

`miniprogram/src/pages/ritual/index.config.ts`：`export default definePageConfig({ navigationStyle: 'custom' })`

- [ ] **Step 5: 运行测试与构建，确认 GREEN**

Run: `cd miniprogram && npm test && npm run typecheck && npm run build:weapp`
Expected: 全部 PASS

- [ ] **Step 6: 在开发者工具中人工确认断点续做**

走到「计划」步后杀掉小程序再打开：应停在同一步且已填内容还在。
把系统日期调到次日再打开：草稿应清空并回到第一步，**不得出现昨晚的内容**。

- [ ] **Step 7: 交付检查**

建议 commit message：
```
feat(miniprogram): 仪式五步流程与断点续做

草稿绑定仪式夜，跨夜自动作废；断网时如实提示「仪式未记录」，
不做本地队列——离线完成不在阶段一范围。
```

---

### Task 9: 晚安页与次日奖励揭晓

> ⚠️ **本任务必须把新建的页面（goodnight / reward）加进 `src/app.config.ts` 的 `pages` 数组**，
> 否则页面无法跳转。`pages` 里不能出现尚不存在的目录，否则 `build:weapp` 会失败。

**Files:**
- Create: `miniprogram/src/store/reveal.ts`
- Create: `miniprogram/src/store/__tests__/reveal.test.ts`
- Create: `miniprogram/src/pages/goodnight/index.tsx`, `index.config.ts`, `index.scss`
- Create: `miniprogram/src/pages/reward/index.tsx`, `index.config.ts`, `index.scss`
- Modify: `miniprogram/src/pages/home/index.tsx`

**Interfaces:**
- Consumes: `api.pendingRewards`、`api.revealRewards`（Task 3）
- Produces: `checkAndRoute(): Promise<boolean>` — 有可揭晓则跳转 reward 页并返回 true

- [ ] **Step 1: 写失败测试**

`miniprogram/src/store/__tests__/reveal.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const nav: string[] = []
vi.mock('@tarojs/taro', () => ({
  default: {
    navigateTo: (o: { url: string }) => { nav.push(o.url); return Promise.resolve() },
    getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {},
  },
}))

const apiMock = { pendingRewards: vi.fn(), revealRewards: vi.fn() }
vi.mock('@/api/endpoints', () => ({ api: apiMock }))

beforeEach(() => { nav.length = 0; vi.clearAllMocks() })

describe('checkAndRoute', () => {
  it('无可揭晓时不跳转，也不消耗奖励', async () => {
    apiMock.pendingRewards.mockResolvedValue({ revealable: false, ritual_dates: [] })
    const { checkAndRoute } = await import('../reveal')
    expect(await checkAndRoute()).toBe(false)
    expect(nav).toHaveLength(0)
    expect(apiMock.revealRewards).not.toHaveBeenCalled()
  })

  it('有可揭晓时跳转到奖励页', async () => {
    apiMock.pendingRewards.mockResolvedValue({ revealable: true, ritual_dates: ['2026-08-27'] })
    const { checkAndRoute } = await import('../reveal')
    expect(await checkAndRoute()).toBe(true)
    expect(nav[0]).toContain('/pages/reward/index')
  })

  it('网络失败时安静返回 false，不打断用户', async () => {
    apiMock.pendingRewards.mockRejectedValue({ code: 'NETWORK_UNAVAILABLE' })
    const { checkAndRoute } = await import('../reveal')
    expect(await checkAndRoute()).toBe(false)
    expect(nav).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/store/__tests__/reveal.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 store/reveal.ts**

```ts
import Taro from '@tarojs/taro'
import { api } from '@/api/endpoints'

/** 启动时检查是否有已到窗口的奖励。
 *  揭晓动作本身在 reward 页触发——避免用户还没看到页面就把奖励消耗掉。 */
export async function checkAndRoute(): Promise<boolean> {
  try {
    const pending = await api.pendingRewards()
    if (!pending.revealable) return false
    await Taro.navigateTo({ url: '/pages/reward/index' })
    return true
  } catch {
    return false            // 网络问题不该打断用户
  }
}
```

- [ ] **Step 4: 实现晚安页**

`miniprogram/src/pages/goodnight/index.tsx`:

```tsx
import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import Screen from '@/components/Screen'
import { DEFAULT_CONFIG, loadConfig } from '@/store/runtime-config'
import './index.scss'

export default function Goodnight() {
  const { params } = useRouter()
  const cfg = loadConfig() ?? DEFAULT_CONFIG
  const eligible = params.eligible === '1'
  const streak = Number(params.streak ?? 0)

  return (
    <Screen
      variant="night"
      background={`${cfg.assets.base_url}/ui/goodnight-room.jpg`}
      className="goodnight"
    >
      <Text className="goodnight__title">今天已经好好结束了。晚安。</Text>
      {eligible ? (
        <View className="goodnight__note">
          <Text className="goodnight__streak">连续按时 {streak} 晚</Text>
          {/* 当晚不揭晓——奖励在仪式夜次日 06:00 之后打开小程序时出现 */}
          <Text className="goodnight__tip">明天早上来看看收藏。</Text>
        </View>
      ) : (
        <Text className="goodnight__tip">不用责怪自己。今晚仍然可以重新开始。</Text>
      )}
      <Text
        className="goodnight__back"
        onClick={() => Taro.switchTab({ url: '/pages/home/index' })}
      >
        回到今晚
      </Text>
    </Screen>
  )
}
```

`miniprogram/src/pages/goodnight/index.scss`:

```scss
.goodnight {
  &__title { display: block; font-size: 38px; line-height: 1.7; margin-bottom: 48px; }
  &__note { display: flex; flex-direction: column; gap: 16px; }
  &__streak { font-size: 30px; color: var(--purple-dark); }
  &__tip { font-size: 28px; color: var(--night-muted); line-height: 1.8; }
  &__back { display: block; margin-top: 96px; font-size: 28px; color: var(--night-muted); }
}
```

- [ ] **Step 5: 实现奖励揭晓页**

`miniprogram/src/pages/reward/index.tsx`:

```tsx
import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { api } from '@/api/endpoints'
import type { RewardItem } from '@/api/types'
import Screen from '@/components/Screen'
import { DEFAULT_CONFIG, loadConfig } from '@/store/runtime-config'
import './index.scss'

export default function Reward() {
  const cfg = loadConfig() ?? DEFAULT_CONFIG
  const [rewards, setRewards] = useState<RewardItem[] | null>(null)
  const [i, setI] = useState(0)

  useEffect(() => {
    // 一次揭晓全部已到窗口的夜记；用户可能数日未打开
    api.revealRewards()
      .then((r) => setRewards(r.rewards))
      .catch(() => {
        Taro.showToast({ title: '网络不可用', icon: 'none' })
        setRewards([])
      })
  }, [])

  if (rewards === null) {
    return (
      <Screen variant="dawn" className="reward">
        <Text className="reward__wait">正在揭晓…</Text>
      </Screen>
    )
  }
  if (rewards.length === 0) {
    return (
      <Screen variant="dawn" className="reward">
        <Text className="reward__wait">还没有可以揭晓的礼物。</Text>
        <Text className="reward__back" onClick={() => Taro.navigateBack()}>返回</Text>
      </Screen>
    )
  }

  const item = rewards[i]!
  const last = i === rewards.length - 1

  return (
    <Screen
      variant="dawn"
      background={`${cfg.assets.base_url}/ui/dawn-room.jpg`}
      className="reward"
    >
      <Text className="reward__lede">昨夜按时熄灯，收到一份安静的礼物。</Text>
      <Image className="reward__art" src={item.art.image} mode="aspectFill" />
      <Text className="reward__title">{item.art.title}</Text>
      <Text className="reward__artist">{item.art.artist} · {item.art.year}</Text>
      {rewards.length > 1 && (
        <Text className="reward__count">第 {i + 1} / {rewards.length} 份</Text>
      )}
      <View className="reward__actions">
        <Text
          className="reward__next"
          onClick={() => {
            if (!last) return setI(i + 1)
            Taro.switchTab({ url: '/pages/collection/index' })
          }}
        >
          {last ? '去收藏看看' : '下一份'}
        </Text>
      </View>
    </Screen>
  )
}
```

`miniprogram/src/pages/reward/index.scss`:

```scss
.reward {
  &__wait { display: block; font-size: 30px; color: var(--night-muted); }
  &__lede { display: block; font-size: 28px; color: var(--night-muted); margin-bottom: 40px; }
  &__art { width: 100%; height: 640px; border-radius: 24px; margin-bottom: 32px; }
  &__title { display: block; font-size: 38px; margin-bottom: 12px; }
  &__artist { display: block; font-size: 26px; color: var(--night-muted); }
  &__count { display: block; margin-top: 24px; font-size: 24px; color: var(--purple-dark); }
  &__actions { margin-top: 72px; }
  &__next { font-size: 30px; color: var(--purple-dark); }
  &__back { display: block; margin-top: 48px; font-size: 28px; color: var(--night-muted); }
}
```

- [ ] **Step 6: 在今晚页接入揭晓检查**

在 `pages/home/index.tsx` 顶部加 `import { checkAndRoute } from '@/store/reveal'`，
并把 `useDidShow` 的首行改为：

```tsx
  useDidShow(() => {
    void checkAndRoute()        // 有已到窗口的奖励则先跳转揭晓
    Promise.all([api.getMe(), api.listNights()])
      .then(/* 原有逻辑不变 */)
      .catch(/* 原有逻辑不变 */)
  })
```

- [ ] **Step 7: 运行测试，确认 GREEN**

Run: `cd miniprogram && npm test && npm run typecheck`
Expected: 全部 PASS

- [ ] **Step 8: 交付检查**

建议 commit message：`feat(miniprogram): 晚安页与次日奖励揭晓`

---

### Task 10: 夜记列表、详情与窗口内编辑

> ⚠️ **本任务必须把新建的页面（journal-detail）加进 `src/app.config.ts` 的 `pages` 数组**，
> 否则页面无法跳转。`pages` 里不能出现尚不存在的目录，否则 `build:weapp` 会失败。

**Files:**
- Create: `miniprogram/src/components/NightCard.tsx`, `NightCard.scss`
- Modify: `miniprogram/src/pages/journal/index.tsx`
- Create: `miniprogram/src/pages/journal/index.scss`
- Create: `miniprogram/src/pages/journal-detail/editable.ts`, `index.tsx`, `index.config.ts`, `index.scss`
- Create: `miniprogram/src/pages/journal-detail/__tests__/editable.test.ts`

**Interfaces:**
- Consumes: `api.listNights`、`api.getNight`、`api.editNightText`、`api.getMe`（Task 3）；`revealWindowOpensAt`（Task 1）
- Produces: `isEditable(ritualDate: string, now: Date, tz: string): boolean`

- [ ] **Step 1: 写失败测试**

`miniprogram/src/pages/journal-detail/__tests__/editable.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { revealWindowOpensAt } from '@/domain/ritual'
import { isEditable } from '../editable'

const TZ = 'Asia/Shanghai'

describe('isEditable', () => {
  it('完成当晚可改', () => {
    expect(isEditable('2026-08-27', new Date('2026-08-27T23:59:00+08:00'), TZ)).toBe(true)
  })

  it('次日 05:59 仍可改', () => {
    expect(isEditable('2026-08-27', new Date('2026-08-28T05:59:00+08:00'), TZ)).toBe(true)
  })

  it('次日 06:00 起固化', () => {
    expect(isEditable('2026-08-27', new Date('2026-08-28T06:00:00+08:00'), TZ)).toBe(false)
  })

  it('数日后不可改', () => {
    expect(isEditable('2026-08-27', new Date('2026-09-01T10:00:00+08:00'), TZ)).toBe(false)
  })

  it('与揭晓窗口用同一条边界', () => {
    const opens = revealWindowOpensAt('2026-08-27', TZ)
    expect(isEditable('2026-08-27', new Date(opens.getTime() - 1000), TZ)).toBe(true)
    expect(isEditable('2026-08-27', opens, TZ)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/pages/journal-detail`
Expected: FAIL — `Cannot find module '../editable'`

- [ ] **Step 3: 实现 editable.ts**

```ts
import { revealWindowOpensAt } from '@/domain/ritual'

/** 夜记正文在揭晓窗口开启前可改，之后固化（spec 修正 7）。
 *  端上这个判断只决定是否显示编辑入口；服务端会再判一次并可能返回 409。 */
export function isEditable(ritualDate: string, now: Date, tz: string): boolean {
  return now.getTime() < revealWindowOpensAt(ritualDate, tz).getTime()
}
```

- [ ] **Step 4: 实现 NightCard 组件**

`miniprogram/src/components/NightCard.tsx`:

```tsx
import { Text, View } from '@tarojs/components'
import type { NightSummary } from '@/api/types'
import './NightCard.scss'

export default function NightCard({ night, onClick }: {
  night: NightSummary; onClick?: () => void
}) {
  const [, m, d] = night.ritual_date.split('-') as [string, string, string]
  return (
    <View className="night-card" onClick={onClick}>
      <Text className="night-card__date">{Number(m)}月{Number(d)}日</Text>
      <Text className={`night-card__badge ${night.is_eligible ? 'is-ok' : ''}`}>
        {night.is_eligible ? '按时' : `晚了 ${night.late_minutes} 分`}
      </Text>
    </View>
  )
}
```

`miniprogram/src/components/NightCard.scss`:

```scss
.night-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 32px 0; border-bottom: 1px solid rgba(89, 78, 95, 0.08);
  &__date { font-size: 32px; color: var(--paper-ink); }
  &__badge {
    font-size: 24px; color: var(--paper-muted);
    padding: 6px 18px; border-radius: 999px; background: rgba(89, 78, 95, 0.06);
    &.is-ok { color: var(--purple); background: rgba(185, 163, 205, 0.28); }
  }
}
```

- [ ] **Step 5: 实现夜记列表页**

`miniprogram/src/pages/journal/index.tsx`:

```tsx
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '@/api/endpoints'
import type { NightSummary } from '@/api/types'
import NightCard from '@/components/NightCard'
import Screen from '@/components/Screen'
import './index.scss'

export default function Journal() {
  const [items, setItems] = useState<NightSummary[]>([])
  const [loaded, setLoaded] = useState(false)

  useDidShow(() => {
    api.listNights()
      .then((r) => { setItems(r.items); setLoaded(true) })
      .catch(() => { setLoaded(true); Taro.showToast({ title: '网络不可用', icon: 'none' }) })
  })

  return (
    <Screen variant="paper" className="journal">
      <Text className="journal__title">夜记</Text>
      {loaded && items.length === 0 && (
        <Text className="journal__empty">
          完成一次睡前仪式后，这里会出现你的熄灯时间和夜晚记录。
        </Text>
      )}
      <View className="journal__list">
        {items.map((n) => (
          <NightCard
            key={n.ritual_date}
            night={n}
            onClick={() => Taro.navigateTo({
              url: `/pages/journal-detail/index?ritual_date=${n.ritual_date}` })}
          />
        ))}
      </View>
    </Screen>
  )
}
```

`miniprogram/src/pages/journal/index.scss`:

```scss
.journal {
  &__title { display: block; font-size: 40px; color: var(--paper-ink); margin-bottom: 40px; }
  &__empty { display: block; font-size: 27px; line-height: 1.9; color: var(--paper-muted); }
  &__list { display: flex; flex-direction: column; }
}
```

- [ ] **Step 6: 实现夜记详情页（含窗口内编辑）**

`miniprogram/src/pages/journal-detail/index.tsx`:

```tsx
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import type { NightDetail } from '@/api/types'
import Screen from '@/components/Screen'
import { isEditable } from './editable'
import './index.scss'

export default function JournalDetail() {
  const { params } = useRouter()
  const ritualDate = params.ritual_date ?? ''
  const [night, setNight] = useState<NightDetail | null>(null)
  const [tz, setTz] = useState('Asia/Shanghai')
  const [editing, setEditing] = useState(false)
  const [gratitudes, setGratitudes] = useState<string[]>([])
  const [plans, setPlans] = useState<string[]>([])

  useEffect(() => {
    Promise.all([api.getNight(ritualDate), api.getMe()])
      .then(([n, me]) => {
        setNight(n)
        setTz(me.settings.timezone)
        setGratitudes(n.gratitudes)
        setPlans(n.plans)
      })
      .catch(() => Taro.showToast({ title: '打不开这条夜记', icon: 'none' }))
  }, [ritualDate])

  if (!night) return <Screen variant="paper" className="detail" />

  const canEdit = isEditable(night.ritual_date, new Date(), tz)

  const save = async () => {
    try {
      const updated = await api.editNightText(
        night.ritual_date,
        gratitudes.filter((x) => x.trim()),
        plans.filter((x) => x.trim()))
      setNight(updated)
      setEditing(false)
      Taro.showToast({ title: '已保存', icon: 'none' })
    } catch (e) {
      const err = e as ApiError
      // 服务端才是权威：端上以为还能改，服务端可能已固化
      Taro.showToast({
        title: err.code === 'RECORD_LOCKED' ? '这一晚已经定下了' : err.message,
        icon: 'none',
      })
      setEditing(false)
    }
  }

  return (
    <Screen variant="paper" className="detail">
      <Text className="detail__date">{night.ritual_date}</Text>
      <Text className="detail__status">
        {night.is_eligible ? '按时熄灯' : `晚了 ${night.late_minutes} 分钟`}
      </Text>

      {!night.text_available && (
        <Text className="detail__warn">这条记录的正文暂时读不出来，其余信息不受影响。</Text>
      )}

      <Text className="detail__section">感恩</Text>
      {editing
        ? gratitudes.map((v, i) => (
            <Input
              key={i} className="detail__input" value={v}
              onInput={(e) => {
                const next = [...gratitudes]; next[i] = e.detail.value; setGratitudes(next)
              }}
            />
          ))
        : night.gratitudes.map((v, i) => <Text key={i} className="detail__item">{v}</Text>)}

      <Text className="detail__section">明天的三件事</Text>
      {editing
        ? plans.map((v, i) => (
            <Input
              key={i} className="detail__input" value={v}
              onInput={(e) => { const next = [...plans]; next[i] = e.detail.value; setPlans(next) }}
            />
          ))
        : night.plans.map((v, i) => <Text key={i} className="detail__item">{v}</Text>)}

      {canEdit && (
        <View className="detail__actions">
          {editing
            ? <Button className="detail__save" onClick={save}>保存</Button>
            : <Text className="detail__edit" onClick={() => setEditing(true)}>修改</Text>}
          <Text className="detail__hint">明早 6 点后这一晚会固定下来</Text>
        </View>
      )}
    </Screen>
  )
}
```

`miniprogram/src/pages/journal-detail/index.scss`:

```scss
.detail {
  &__date { display: block; font-size: 40px; color: var(--paper-ink); }
  &__status { display: block; margin-top: 12px; font-size: 26px; color: var(--paper-muted); }
  &__warn {
    display: block; margin-top: 24px; padding: 20px 24px; border-radius: 16px;
    background: rgba(185, 163, 205, 0.12); color: var(--purple); font-size: 24px; line-height: 1.7;
  }
  &__section { display: block; margin: 48px 0 20px; font-size: 26px; color: var(--paper-muted); }
  &__item { display: block; font-size: 30px; line-height: 1.9; color: var(--paper-ink); }
  &__input {
    padding: 20px 0; font-size: 30px; color: var(--paper-ink);
    border-bottom: 1px solid rgba(89, 78, 95, 0.12);
  }
  &__actions { margin-top: 64px; display: flex; flex-direction: column; gap: 16px; }
  &__edit { font-size: 30px; color: var(--purple); }
  &__save { background: var(--purple); color: var(--white); border-radius: 999px; font-size: 30px; }
  &__hint { font-size: 24px; color: var(--paper-muted); }
}
```

- [ ] **Step 7: 运行测试，确认 GREEN**

Run: `cd miniprogram && npm test -- src/pages/journal-detail && npm run typecheck`
Expected: 5 passed

- [ ] **Step 8: 交付检查**

建议 commit message：`feat(miniprogram): 夜记列表、详情与揭晓窗口前的正文编辑`

---

### Task 11: 收藏与作品详情

> ⚠️ **本任务必须把新建的页面（art-detail）加进 `src/app.config.ts` 的 `pages` 数组**，
> 否则页面无法跳转。`pages` 里不能出现尚不存在的目录，否则 `build:weapp` 会失败。

**Files:**
- Create: `miniprogram/src/components/ArtCard.tsx`, `ArtCard.scss`
- Modify: `miniprogram/src/pages/collection/index.tsx`
- Create: `miniprogram/src/pages/collection/index.scss`
- Create: `miniprogram/src/pages/art-detail/index.tsx`, `index.config.ts`, `index.scss`

**Interfaces:**
- Consumes: `api.getCollection`、`api.getArt`（Task 3）

- [ ] **Step 1: 实现 ArtCard**

`miniprogram/src/components/ArtCard.tsx`:

```tsx
import { Image, Text, View } from '@tarojs/components'
import type { ArtBrief } from '@/api/types'
import './ArtCard.scss'

export default function ArtCard({ art, count, onClick }: {
  art: ArtBrief; count: number; onClick?: () => void
}) {
  return (
    <View className="art-card" onClick={onClick}>
      <Image className="art-card__thumb" src={art.thumbnail} mode="aspectFill" lazyLoad />
      <Text className="art-card__title">{art.title}</Text>
      {count > 1 && <Text className="art-card__count">× {count}</Text>}
    </View>
  )
}
```

`miniprogram/src/components/ArtCard.scss`:

```scss
.art-card {
  position: relative;
  &__thumb {
    width: 100%; height: 300px; border-radius: 16px;
    background: rgba(89, 78, 95, 0.06);
  }
  &__title { display: block; margin-top: 14px; font-size: 26px; color: var(--paper-ink); }
  &__count {
    position: absolute; right: 14px; top: 14px;
    padding: 4px 14px; border-radius: 999px; font-size: 22px;
    background: var(--scrim); color: var(--white);
  }
}
```

- [ ] **Step 2: 实现收藏页**

`miniprogram/src/pages/collection/index.tsx`:

```tsx
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '@/api/endpoints'
import type { CollectionResponse } from '@/api/types'
import ArtCard from '@/components/ArtCard'
import Screen from '@/components/Screen'
import './index.scss'

export default function Collection() {
  const [data, setData] = useState<CollectionResponse | null>(null)

  useDidShow(() => {
    api.getCollection()
      .then(setData)
      .catch(() => Taro.showToast({ title: '网络不可用', icon: 'none' }))
  })

  return (
    <Screen variant="paper" className="collection">
      <Text className="collection__title">收藏</Text>
      {data && (
        // 区分「累计卡片数」与「不同作品数」——重复抽中同一幅是允许的
        <Text className="collection__summary">
          已收藏 {data.total_cards} 张 · {data.unique_works} 幅作品
        </Text>
      )}
      {data && data.items.length === 0 && (
        <Text className="collection__empty">
          按计划完成一次熄灯仪式，明天会收到一幅安静的艺术作品。
        </Text>
      )}
      <View className="collection__grid">
        {data?.items.map((item) => (
          <ArtCard
            key={item.art.id}
            art={item.art}
            count={item.count}
            onClick={() => Taro.navigateTo({ url: `/pages/art-detail/index?id=${item.art.id}` })}
          />
        ))}
      </View>
    </Screen>
  )
}
```

`miniprogram/src/pages/collection/index.scss`:

```scss
.collection {
  &__title { display: block; font-size: 40px; color: var(--paper-ink); }
  &__summary { display: block; margin-top: 12px; font-size: 26px; color: var(--paper-muted); }
  &__empty {
    display: block; margin-top: 40px; font-size: 27px;
    line-height: 1.9; color: var(--paper-muted);
  }
  &__grid { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
}
```

- [ ] **Step 3: 实现作品详情页**

`miniprogram/src/pages/art-detail/index.tsx`:

```tsx
import { Image, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import type { ArtDetail as Art } from '@/api/types'
import Screen from '@/components/Screen'
import './index.scss'

export default function ArtDetail() {
  const { params } = useRouter()
  const [art, setArt] = useState<Art | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    api.getArt(params.id ?? '')
      .then(setArt)
      .catch((e: ApiError) => {
        // 410：作品因版权等原因被撤回，已收藏用户也不再展示
        if (e.status === 410) setGone(true)
        else Taro.showToast({ title: '打不开这幅作品', icon: 'none' })
      })
  }, [params.id])

  if (gone) {
    return (
      <Screen variant="paper" className="art">
        <Text className="art__gone">这幅作品已经下架，不再展示。</Text>
      </Screen>
    )
  }
  if (!art) return <Screen variant="paper" className="art" />

  return (
    <Screen variant="paper" className="art">
      <Image className="art__image" src={art.image} mode="widthFix" />
      <Text className="art__title">{art.title}</Text>
      <Text className="art__meta">{art.artist} · {art.year}</Text>
      <Text className="art__article">{art.article}</Text>
      <Text className="art__source">{art.source}</Text>
    </Screen>
  )
}
```

`miniprogram/src/pages/art-detail/index.scss`:

```scss
.art {
  &__image { width: 100%; border-radius: 20px; }
  &__title { display: block; margin-top: 32px; font-size: 40px; color: var(--paper-ink); }
  &__meta { display: block; margin-top: 10px; font-size: 26px; color: var(--paper-muted); }
  &__article {
    display: block; margin-top: 40px; font-size: 30px;
    line-height: 2; color: var(--paper-ink);
  }
  &__source {
    display: block; margin-top: 48px; font-size: 22px;
    line-height: 1.8; color: var(--paper-muted);
  }
  &__gone { display: block; font-size: 30px; color: var(--paper-muted); }
}
```

- [ ] **Step 4: 运行构建，确认通过**

Run: `cd miniprogram && npm run typecheck && npm run build:weapp`
Expected: 通过

- [ ] **Step 5: 交付检查**

建议 commit message：`feat(miniprogram): 收藏页与作品详情，含撤回作品的 410 处理`

---

### Task 12: 设置页与注销

**Files:**
- Modify: `miniprogram/src/pages/settings/index.tsx`
- Create: `miniprogram/src/pages/settings/index.scss`

**Interfaces:**
- Consumes: `api.getMe`、`api.updateSettings`、`api.updateNickname`、`api.deleteAccount`（Task 3）；`clearTokens`（Task 3）；`clearDraft`（Task 4）

- [ ] **Step 1: 实现设置页**

`miniprogram/src/pages/settings/index.tsx`:

```tsx
import { Button, Input, Picker, Switch, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '@/api/endpoints'
import type { MeResponse, SettingsPayload } from '@/api/types'
import Screen from '@/components/Screen'
import { clearTokens } from '@/store/auth'
import { clearDraft } from '@/store/draft'
import './index.scss'

export default function Settings() {
  const [me, setMe] = useState<MeResponse | null>(null)

  useDidShow(() => {
    api.getMe().then(setMe).catch(() => Taro.showToast({ title: '网络不可用', icon: 'none' }))
  })

  if (!me) return <Screen variant="paper" className="settings" />

  const patch = async (over: Partial<SettingsPayload>) => {
    const prev = me
    const next = { ...me.settings, ...over }
    setMe({ ...me, settings: next })
    try {
      await api.updateSettings(next)
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
      setMe(prev)                       // 回滚到服务端已知状态
    }
  }

  const remove = () => {
    Taro.showModal({
      title: '注销账号',
      content: '将永久删除你的全部夜记、收藏与设置，无法恢复。确定吗？',
      confirmText: '注销',
      confirmColor: '#9B3B33',
      success: async ({ confirm }) => {
        if (!confirm) return
        try {
          await api.deleteAccount()
          clearTokens()
          clearDraft()
          Taro.reLaunch({ url: '/pages/welcome/index' })
        } catch {
          Taro.showToast({ title: '注销失败，请稍后再试', icon: 'none' })
        }
      },
    })
  }

  return (
    <Screen variant="paper" className="settings">
      <Text className="settings__title">设置</Text>

      <View className="settings__row">
        <Text className="settings__label">昵称</Text>
        {/* 必须是受控输入：只绑 onBlur 的非受控写法在微信端配合拼音输入法
            有丢字/回退风险，且与本仓库另外两处 Input（ritual、journal-detail）不一致 */}
        <Input
          className="settings__input"
          value={nickname}
          placeholder="可不填"
          onInput={(e) => setNickname(e.detail.value)}
          onBlur={() => {
            const v = nickname.trim()
            if (!v || v === me.nickname) return
            api.updateNickname(v)
              .then(setMe)
              .catch(() => {
                Taro.showToast({ title: '这个昵称不能使用', icon: 'none' })
                setNickname(me.nickname ?? '')      // 回滚到上一次已知有效值
              })
          }}
        />
      </View>

      <Picker
        mode="time" value={me.settings.bedtime}
        onChange={(e) => patch({ bedtime: String(e.detail.value) })}
      >
        <View className="settings__row">
          <Text className="settings__label">计划入睡</Text>
          <Text className="settings__value">{me.settings.bedtime}</Text>
        </View>
      </Picker>

      <Picker
        mode="time" value={me.settings.wake_time}
        onChange={(e) => patch({ wake_time: String(e.detail.value) })}
      >
        <View className="settings__row">
          <Text className="settings__label">计划起床</Text>
          <Text className="settings__value">{me.settings.wake_time}</Text>
        </View>
      </Picker>

      <View className="settings__row">
        <Text className="settings__label">减少动态效果</Text>
        <Switch
          checked={me.settings.reduced_motion}
          onChange={(e) => patch({ reduced_motion: e.detail.value })}
        />
      </View>

      <View className="settings__row settings__row--stack">
        <Text className="settings__label">时区</Text>
        <Text className="settings__note">
          {me.settings.timezone} · 判定按时与揭晓时间都以此为准
        </Text>
      </View>

      <Button className="settings__danger" onClick={remove}>注销账号</Button>
      <Text className="settings__legal">
        感恩与计划的正文加密保存，仅你可见。匿名统计不包含任何正文内容。
      </Text>
    </Screen>
  )
}
```

`miniprogram/src/pages/settings/index.scss`:

```scss
.settings {
  &__title { display: block; font-size: 40px; color: var(--paper-ink); margin-bottom: 32px; }
  &__row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 32px 0; border-bottom: 1px solid rgba(89, 78, 95, 0.08);
    &--stack { flex-direction: column; align-items: flex-start; gap: 10px; }
  }
  &__label { font-size: 30px; color: var(--paper-ink); }
  &__value { font-size: 30px; color: var(--purple); }
  &__input { font-size: 30px; text-align: right; color: var(--paper-ink); }
  &__note { font-size: 24px; color: var(--paper-muted); line-height: 1.7; }
  &__danger {
    margin-top: 72px; background: transparent; color: #9b3b33;
    border: 1px solid rgba(155, 59, 51, 0.4); border-radius: 999px; font-size: 28px;
  }
  &__legal {
    display: block; margin-top: 40px; font-size: 22px;
    line-height: 1.9; color: var(--paper-muted);
  }
}
```

- [ ] **Step 2: 运行构建，确认通过**

Run: `cd miniprogram && npm run typecheck && npm run build:weapp`
Expected: 通过

- [ ] **Step 3: 交付检查**

建议 commit message：`feat(miniprogram): 设置页与注销`

---

### Task 13: 匿名事件上报

**Files:**
- Create: `miniprogram/src/utils/events.ts`
- Create: `miniprogram/src/utils/__tests__/events.test.ts`
- Modify: `miniprogram/src/pages/ritual/index.tsx`, `miniprogram/src/pages/reward/index.tsx`, `miniprogram/src/app.tsx`

**Interfaces:**
- Consumes: `api.postEvents`（Task 3）；`toIsoWithOffset`（Task 4）
- Produces: `queueEvent(type: string, payload?: Record<string, unknown>): void`
- Produces: `flushEvents(): Promise<void>`

- [ ] **Step 1: 写失败测试**

`miniprogram/src/utils/__tests__/events.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: Record<string, any> = {}
vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync: (k: string) => store[k] ?? '',
    setStorageSync: (k: string, v: any) => { store[k] = v },
    removeStorageSync: (k: string) => { delete store[k] },
  },
}))

// 必须声明形参：无参 mock 会让 TS 把 mock.calls 推断成空元组 []，
// 后面 calls[0]![0] 在 strict + noUncheckedIndexedAccess 下会报 TS2493。
const postEvents = vi.fn(async (_events: unknown[]) => undefined)
vi.mock('@/api/endpoints', () => ({ api: { postEvents } }))

beforeEach(() => { store = {}; postEvents.mockClear() })

describe('匿名事件', () => {
  it('入队后可批量上报并清空', async () => {
    const { flushEvents, queueEvent } = await import('../events')
    queueEvent('ritual_completed', { eligible: true })
    queueEvent('reward_revealed', { draws: 2 })
    await flushEvents()
    expect(postEvents).toHaveBeenCalledTimes(1)
    expect(postEvents.mock.calls[0]![0]).toHaveLength(2)
    await flushEvents()
    expect(postEvents).toHaveBeenCalledTimes(1)     // 队列已空，不再发
  })

  it('★ 剥掉正文字段——后端 schema 也会拒收，此处是第一道闸', async () => {
    const { flushEvents, queueEvent } = await import('../events')
    queueEvent('ritual_completed', {
      eligible: true, gratitudes: ['私人内容'], plans: ['私人计划'], nickname: '张三',
    })
    await flushEvents()
    const sent = postEvents.mock.calls[0]![0] as any[]
    expect(sent[0].payload).toEqual({ eligible: true })
  })

  it('上报失败时保留队列，下次再试', async () => {
    postEvents.mockRejectedValueOnce(new Error('offline'))
    const { flushEvents, queueEvent } = await import('../events')
    queueEvent('t', {})
    await flushEvents()
    await flushEvents()
    expect(postEvents).toHaveBeenCalledTimes(2)
  })

  it('队列有上限，不无限增长', async () => {
    const { flushEvents, queueEvent } = await import('../events')
    for (let i = 0; i < 250; i++) queueEvent('t', { i })
    await flushEvents()
    expect((postEvents.mock.calls[0]![0] as any[]).length).toBeLessThanOrEqual(200)
  })
})
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd miniprogram && npm test -- src/utils`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 utils/events.ts**

```ts
import Taro from '@tarojs/taro'
import { api } from '@/api/endpoints'
import type { EventItem } from '@/api/types'
import { toIsoWithOffset } from './time'

const KEY = 'zhusheng-events-v1'
const MAX = 200          // 与后端 EventBatch 的上限一致

/** 绝不可进入匿名事件的字段。后端 schema 层也会拒收，此处是第一道闸。 */
const FORBIDDEN = new Set([
  'gratitudes', 'plans', 'openid', 'session_key', 'nickname', 'avatar_url',
  'text', 'content', 'access_token', 'refresh_token',
])

function scrub(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) if (!FORBIDDEN.has(k)) out[k] = v
  return out
}

function read(): EventItem[] {
  const raw = Taro.getStorageSync(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const write = (xs: EventItem[]) => Taro.setStorageSync(KEY, JSON.stringify(xs.slice(-MAX)))

export function queueEvent(type: string, payload: Record<string, unknown> = {}): void {
  write([...read(), { type, payload: scrub(payload), occurred_at: toIsoWithOffset(new Date()) }])
}

export async function flushEvents(): Promise<void> {
  const events = read()
  if (events.length === 0) return
  try {
    await api.postEvents(events)
    Taro.removeStorageSync(KEY)
  } catch {
    // 保留队列，下次启动再试。事件丢失不影响业务正确性。
  }
}
```

- [ ] **Step 4: 在关键节点埋点**

在 `pages/ritual/index.tsx` 顶部加 `import { queueEvent } from '@/utils/events'`，
并在 `finish()` 的 `clearDraft()` 之后加：

```tsx
      queueEvent('ritual_completed', {
        ritual_date: res.ritual_date, eligible: res.is_eligible,
        late_minutes: res.late_minutes, streak: res.streak,
      })
```

在 `pages/reward/index.tsx` 的 `.then` 里加：

```tsx
      .then((r) => {
        setRewards(r.rewards)
        queueEvent('reward_revealed', { count: r.rewards.length })
      })
```

在 **`src/store/session.ts` 的 `routeAfterBootstrap()` 里、`await bootstrap()` 成功之后**加 `void flushEvents()`。

> ⚠️ Task 6 的修复已把 `bootstrap()` 的调用与成功/失败分支从 `app.tsx` 下沉到 `session.ts`，
> `app.tsx` 现在只调 `routeAfterBootstrap()`。本计划早期版本写的「在 app.tsx 的 bootstrap
> 成功分支」在当前代码里已无对应位置——这是前序任务的修复让后序任务的计划指向失效的例子。

- [ ] **Step 5: 运行测试，确认 GREEN**

Run: `cd miniprogram && npm test -- src/utils && npm run typecheck`
Expected: 4 passed

- [ ] **Step 6: 交付检查**

建议 commit message：
```
feat(miniprogram): 匿名事件本地队列与批量上报

payload 在端上先剥掉正文字段，后端 schema 层再拒收一次。
```

---

### Task 14: 端到端联调验收

**Files:**
- Create: `miniprogram/src/__tests__/contract-parity.test.ts`
- Create: `miniprogram/VERIFY.md`

**Interfaces:**
- Consumes: 前述全部模块

- [ ] **Step 1: 写两端一致性测试**

`miniprogram/src/__tests__/contract-parity.test.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../..')

describe('两端契约一致', () => {
  it('契约文件只有一份，两端都指向它', () => {
    expect(fs.existsSync(path.join(ROOT, 'shared', 'ritual-cases.json'))).toBe(true)

    const pyTest = fs.readFileSync(
      path.join(ROOT, 'backend', 'tests', 'test_domain_contract.py'), 'utf8')
    expect(pyTest).toContain('ritual-cases.json')

    const tsTest = fs.readFileSync(
      path.join(ROOT, 'miniprogram', 'src', 'domain', '__tests__', 'ritual.contract.test.ts'),
      'utf8')
    expect(tsTest).toContain('@shared/ritual-cases.json')
  })

  it('两端的常量一致', () => {
    const py = fs.readFileSync(path.join(ROOT, 'backend', 'app', 'domain', 'ritual.py'), 'utf8')
    const ts = fs.readFileSync(
      path.join(ROOT, 'miniprogram', 'src', 'domain', 'ritual.ts'), 'utf8')

    for (const [name, value] of [
      ['RITUAL_NIGHT_BOUNDARY_HOUR', '6'],
      ['REVEAL_HOUR', '6'],
      ['BASE_DOUBLE_STREAK', '14'],
    ] as const) {
      expect(py, `Python 缺 ${name}`).toMatch(new RegExp(`${name}\\s*[:=].*${value}`))
      expect(ts, `TS 缺 ${name}`).toMatch(new RegExp(`${name}\\s*=\\s*${value}`))
    }
  })

  it('端上覆盖 spec 第六节的全部接口', () => {
    const endpoints = fs.readFileSync(
      path.join(ROOT, 'miniprogram', 'src', 'api', 'endpoints.ts'), 'utf8')
    for (const p of [
      '/api/v1/auth/wx-login', '/api/v1/auth/refresh', '/api/v1/me',
      '/api/v1/me/settings', '/api/v1/nights/complete', '/api/v1/nights',
      '/api/v1/rewards/pending', '/api/v1/rewards/reveal', '/api/v1/collection',
      '/api/v1/config', '/api/v1/events',
    ]) {
      expect(endpoints, `缺接口 ${p}`).toContain(p)
    }
  })

  it('端上不硬编码域名', () => {
    const src = path.join(ROOT, 'miniprogram', 'src')
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name))
          : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [])
    for (const file of walk(src)) {
      const code = fs.readFileSync(file, 'utf8')
      expect(code, `${file} 硬编码了域名`).not.toMatch(/https?:\/\/(?!localhost)[a-z0-9.-]+\.(com|cn|net)/i)
    }
  })
})
```

- [ ] **Step 2: 运行全部自动化测试**

Run:
```bash
cd miniprogram && npm test && npm run typecheck && npm run build:weapp
cd ../backend && .venv/bin/python -m pytest -q
```
Expected: 两端全绿，构建成功

- [ ] **Step 3: 写人工验收清单**

`miniprogram/VERIFY.md`:

```markdown
# 小程序人工验收清单

自动化测试覆盖 domain、API 客户端、存储与纯逻辑；UI 与真机行为需人工走查。
微信小程序的端到端自动化依赖开发者工具的 automator，阶段一不引入。

## 准备

1. `cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000`
2. `cd miniprogram && npm run build:weapp`
3. 微信开发者工具导入 `miniprogram/dist`，**详情 → 本地设置 → 勾选「不校验合法域名」**

## 主链路

- [ ] 首次打开：无任何登录弹窗，直接进欢迎页
- [ ] 三步引导可前进，最后一步进入开场视频
- [ ] 开场视频可播放；点「跳过」能进今晚页；视频取不到时不卡住
- [ ] 今晚页倒计时每秒走动，距离 10 分钟内变色（near 相位）
- [ ] 走完五步仪式，晚安页显示「明天早上来看看收藏」
- [ ] **当晚**去收藏页：没有新卡片（奖励不当晚揭晓）

## 揭晓窗口

- [ ] 把系统日期调到次日 05:59，重开小程序：无揭晓
- [ ] 调到次日 06:00，重开：自动进入奖励页，出现一幅作品
- [ ] 收藏页出现该作品，计数正确
- [ ] 点作品进详情，文章与来源完整显示

## 断点续做与草稿

- [ ] 走到「计划」步杀掉小程序再开：停在同一步，已填内容还在
- [ ] 把日期调到次日再开：草稿清空，回到第一步（**不得出现昨晚的内容**）

## 夜记编辑

- [ ] 次日 06:00 前打开夜记详情：有「修改」入口，改后保存成功
- [ ] 次日 06:00 后打开：无「修改」入口
- [ ] 若在窗口边界强行保存，提示「这一晚已经定下了」

## 网络与降级

- [ ] 开发者工具切「无网络」，点熄灯：提示「网络不可用，仪式未记录」，**不假装成功**
- [ ] 恢复网络后重新完成：正常记录

## 视觉与适配

- [ ] 四个 tab 切换时整排图标配色随之改变
- [ ] iPhone SE (375pt) 与 iPhone 15 Pro Max 下无横向溢出
- [ ] 设置里打开「减少动态效果」后，动画停止
- [ ] 安全区：底部 tabBar 不被 Home Indicator 遮挡

## 隐私

- [ ] 设置页底部隐私说明存在
- [ ] 注销弹窗文案明确「无法恢复」，注销后回到欢迎页且数据清空
```

- [ ] **Step 4: 按清单人工走查**

在微信开发者工具中逐条执行 `VERIFY.md`。**发现不符要如实记录，不得声称完成。**

- [ ] **Step 5: 逐条核对 spec 的 7 处修正**

确认端上行为一致：揭晓窗口 06:00、连续按时衰减、资格窗口、抽卡曲线（门槛 14 晚）、
草稿跨夜作废、时区显式传递、正文窗口内可改。

- [ ] **Step 6: 交付检查**

建议 commit message：`test(miniprogram): 两端契约一致性测试与人工验收清单`

---

## 后续

**上线前必须完成**（与后端计划共享，本计划不覆盖）：
- 获取小程序 AppID，替换 `project.config.json` 的 `touristappid`
- 备案域名 + HTTPS，写入 `config/prod.ts` 的 `API_BASE_URL`，
  并在小程序后台登记为 request / downloadFile 合法域名
- 图片迁至对象存储，改后端 `ASSET_BASE_URL`
- 关闭后端 `WX_MOCK_LOGIN`，接入真实 `code2Session` 与 `msgSecCheck`
- 头像上传功能（阶段一留接口但禁用，需对象存储就绪）
- 轮换已泄露的数据库与 Redis 口令
- 验证被恢复的 `public.users` 中 admin 密码是否为最新
