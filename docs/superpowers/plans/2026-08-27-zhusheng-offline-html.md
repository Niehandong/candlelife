# 烛生离线 HTML 原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复后台与小程序 HTML 的流程和状态模型，并保证两个页面通过 `file://` 直接运行。

**Architecture:** 新增一个 UMD 风格的无依赖 `zhusheng-core.js`，用普通相对脚本同时服务浏览器和 Node 测试。后台通过版本化 JSON 导出运营配置，小程序通过文件选择导入；私人内容、完成记录、奖励与备份都保存在本地，不执行启动网络请求。

**Tech Stack:** HTML5、CSS、原生 JavaScript、Node.js 内置 `node:test`、浏览器 `FileReader`/Blob API。

**Spec:** `docs/superpowers/specs/2026-08-27-zhusheng-offline-html-design.md`

## Global Constraints

- 不转换为 WXML、WXSS 或微信小程序 JavaScript。
- 页面启动不得依赖 localhost、HTTP 服务、ES module、Service Worker 或 `fetch()`。
- 所有图片、SVG 和视频路径使用 `./image/...`。
- 感恩和计划正文只进入本地记录与本地备份，不进入匿名事件。
- 后台保存立即生效于后台本地配置，运营配置通过 JSON 文件传递给小程序。
- 当前目录不是 Git 仓库；每个任务以测试通过和差异检查代替 commit。

---

### Task 1: 离线核心状态模型

**Files:**
- Create: `zhusheng-core.js`
- Create: `tests/zhusheng-core.test.js`

**Interfaces:**
- Produces: `window.ZhushengCore` / `module.exports`
- Produces: `SCHEMA_VERSION`, `DEFAULT_CONFIG`
- Produces: `dateKey(date)`, `evaluateCompletion(input)`, `calculateOnTimeStreak(records)`, `rewardDrawCount(streak)`, `canRevealReward(record, now)`, `drawRewards(pool, count, random)`, `summarizeCollection(rewards)`, `validateArt(art)`, `validateConfig(config)`, `parseEnvelope(text, kind)`

- [ ] **Step 1: Write failing Node tests**

Create fixed-time tests that assert:

```js
assert.equal(core.evaluateCompletion({plannedTime:'23:30',completedAt:'2026-08-27T23:59:00+08:00',toleranceMinutes:30}).eligible, true);
assert.equal(core.evaluateCompletion({plannedTime:'23:30',completedAt:'2026-08-28T00:01:00+08:00',toleranceMinutes:30}).eligible, false);
assert.equal(core.rewardDrawCount(3), 2);
assert.equal(core.rewardDrawCount(7), 2);
assert.equal(core.rewardDrawCount(4), 1);
assert.equal(core.canRevealReward(record, new Date('2026-08-28T07:00:00+08:00')), true);
assert.deepEqual(core.summarizeCollection([{artId:'a'},{artId:'a'},{artId:'b'}]), {totalCards:3,uniqueWorks:2,counts:{a:2,b:1}});
```

Add validation cases for malformed config, incomplete art, invalid JSON and wrong envelope kind.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/zhusheng-core.test.js`

Expected: FAIL because `../zhusheng-core.js` does not exist.

- [ ] **Step 3: Implement minimal pure functions**

Use a UMD wrapper:

```js
(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ZhushengCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  // pure functions and frozen defaults
  return { SCHEMA_VERSION, DEFAULT_CONFIG, dateKey, evaluateCompletion,
    calculateOnTimeStreak, rewardDrawCount, canRevealReward, drawRewards,
    summarizeCollection, validateArt, validateConfig, parseEnvelope };
});
```

`evaluateCompletion` resolves the planned bedtime that belongs to the completion night, including after-midnight completion. Eligibility is `actual <= planned + tolerance` and not earlier than six hours before the planned time.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/zhusheng-core.test.js`

Expected: all core tests PASS with zero warnings.

### Task 2: 小程序游客与次日奖励流程

**Files:**
- Modify: `zhusheng-sleep-figma.html`
- Create: `tests/offline-html.test.js`

**Interfaces:**
- Consumes: `window.ZhushengCore`
- Produces local keys: `zhusheng-records-v2`, `zhusheng-rewards-v2`, `zhusheng-events-v1`, `zhusheng-runtime-config-v1`

- [ ] **Step 1: Write failing structural tests**

Read the HTML with Node and assert that it:

```js
assert.match(html, /<script src="\.\/zhusheng-core\.js"><\/script>/);
assert.doesNotMatch(html, /data-screen="login"|data-screen="register"|data-screen="permission"/);
assert.doesNotMatch(html, /微信快捷登录|订阅一次睡前提醒/);
assert.match(html, /id="importConfigInput"/);
assert.match(html, /id="exportBackup"/);
assert.match(html, /id="importBackupInput"/);
assert.match(html, /id="legalDialog"/);
```

Scan every `src`, `poster` and preload `href` and assert each local resource exists relative to the HTML.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/offline-html.test.js`

Expected: FAIL because forced login/reminder screens exist and offline import/export controls do not.

- [ ] **Step 3: Implement guest onboarding and legal dialog**

Change welcome CTA to the guide, remove login/register/permission screens and their handlers, and add clickable user agreement/privacy buttons opening one accessible dialog. Add the classic core script before the inline application script.

- [ ] **Step 4: Implement completion records and deferred rewards**

On first entry to `goodnight`, create one idempotent completion record using `evaluateCompletion`. Do not navigate from goodnight to reward. On startup, call `canRevealReward` for unrevealed eligible records; if true, create 1 or 2 reward rows according to the current on-time streak and route the first session of the day to reward.

Change journal rendering to current local records and collection rendering to `{totalCards, uniqueWorks, counts}`. Remove fixed `1 / 100` and preset locked cards.

- [ ] **Step 5: Implement offline config and backup controls**

Add hidden file inputs plus visible buttons in Settings. Config import calls `parseEnvelope(text, 'zhusheng-config')` and `validateConfig`; backup import calls `parseEnvelope(text, 'zhusheng-backup')`. Parse and validate before writing any local key. Export uses Blob downloads and includes a privacy warning in the UI.

- [ ] **Step 6: Run structural tests and verify GREEN**

Run: `node --test tests/offline-html.test.js tests/zhusheng-core.test.js`

Expected: all tests PASS.

### Task 3: 后台统一配置与艺术作品池

**Files:**
- Modify: `zhusheng-admin.html`
- Modify: `tests/offline-html.test.js`

**Interfaces:**
- Consumes: `window.ZhushengCore.DEFAULT_CONFIG`, `validateArt`, `validateConfig`
- Produces download envelope: `{kind:'zhusheng-config', schemaVersion:1, exportedAt, data}`

- [ ] **Step 1: Add failing admin behavior contracts**

Assert that the backend:

```js
assert.match(admin, /<script src="\.\/zhusheng-core\.js"><\/script>/);
assert.match(admin, /id="exportConfig"/);
assert.match(admin, /id="lastModified"/);
assert.match(admin, /id="newThumb"/);
assert.match(admin, /id="newImage"/);
assert.match(admin, /id="newAlt"/);
assert.doesNotMatch(admin, /reminderLead|gentleReminder|订阅一次/);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/offline-html.test.js`

Expected: FAIL on missing config export, audit metadata and art fields.

- [ ] **Step 3: Implement unified save and config export**

Each form submission merges form values into one runtime config object, updates `updatedBy` and `updatedAt`, persists it, refreshes the audit label and immediately reports success. `exportConfig` downloads the validated versioned envelope.

- [ ] **Step 4: Implement complete art validation and persistence**

Extend the dialog with thumbnail, full image, alt text, source and article as required fields. Normalize relative paths to `./image/...`; call `validateArt` before insertion. Persist the array, rebuild the table from data after reload, calculate metrics from current data and export CSV from current rows.

- [ ] **Step 5: Implement dialog accessibility**

Focus `#newArtTitle` after open, set the main shell `inert`, trap Tab/Shift+Tab within the dialog, close on Escape, remove `inert`, and restore trigger focus.

- [ ] **Step 6: Run all Node tests**

Run: `node --test tests/*.test.js`

Expected: all tests PASS with zero failures.

### Task 4: 直接文件运行与视觉回归

**Files:**
- Modify if defects are found: `zhusheng-admin.html`, `zhusheng-sleep-figma.html`, `zhusheng-core.js`
- Test: `tests/zhusheng-core.test.js`, `tests/offline-html.test.js`

**Interfaces:**
- Consumes the complete offline bundle.

- [ ] **Step 1: Run syntax and static verification**

Run:

```bash
node --check zhusheng-core.js
node --test tests/*.test.js
```

Expected: exit 0 and zero failed tests.

- [ ] **Step 2: Open both pages with file URLs**

Navigate the browser directly to:

```text
file:///Users/apple/Documents/candlelife/zhusheng-sleep-figma.html
file:///Users/apple/Documents/candlelife/zhusheng-admin.html
```

Verify zero uncaught console errors, zero broken resources, working guide/ritual/settings navigation, and working backend navigation/dialog.

- [ ] **Step 3: Verify responsive layouts**

At 390×844 confirm no horizontal overflow, fixed controls remain reachable, dialogs fit the viewport and the collection can scroll. At desktop width confirm the admin table and modal remain usable.

- [ ] **Step 4: Verify offline transfers**

Export config from the backend, import it in the small-program page, and verify a visible configured field changes. Export a local backup, import a deliberately malformed file and verify existing records remain unchanged.

- [ ] **Step 5: Final requirement audit**

Re-read the design spec and map every requirement to a passing automated test or browser observation. Report any unimplemented constraint rather than claiming completion.
