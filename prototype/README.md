# 原型归档（只读）

烛生的离线 HTML 原型，正式开发的视觉与规则来源。**不再改动。**

- `zhusheng-sleep-figma.html` — 小程序原型（18 个页面）
- `zhusheng-admin.html` — PC 后台原型（5 个模块）
- `zhusheng-core.js` — 业务规则的原始出处，已移植为
  `backend/app/domain/ritual.py` 与 `miniprogram/src/domain/ritual.ts`
- `在Chrome中打开.command` — macOS 下双击打开两个页面

> 原型的规则有若干缺陷，已在正式设计中修正，详见
> `docs/superpowers/specs/2026-08-30-zhusheng-backend-miniprogram-design.md`
> 的「对原型规则的修正」一节。移植时以 spec 为准，不要照抄本目录代码。

跑原型的测试：

```bash
cd prototype && node --test tests/zhusheng-core.test.js tests/offline-html.test.js
```
