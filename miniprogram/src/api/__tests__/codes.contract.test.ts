import { describe, expect, it } from 'vitest'

import {
  CODE_ART_WITHDRAWN, CODE_RECORD_LOCKED, CODE_TOKEN_INVALID,
  CODE_TOKEN_KIND_MISMATCH, CODE_TOKEN_MISSING, CODE_USER_NOT_FOUND,
  CODE_WX_CODE_INVALID, SESSION_DEAD_CODES,
} from '../codes'

/**
 * 错误码不许与后端漂移。
 *
 * codes.ts 里的数字是手抄 backend/app/core/codes.py 的，原本没有任何东西守着 ——
 * 后端改一个编号，这里不会变红，只会在某天悄悄走错分支。最要命的是
 * SESSION_DEAD_CODES：它一旦对不上，token 自动刷新与重新登录会整个失灵，
 * 而且失灵得很安静（用户只是莫名其妙被登出，或者卡在一个永远 40102 的循环里）。
 *
 * 后端把全表放进 openapi.json 的 info['x-error-codes']，这里逐个比对。
 *
 * 需要后端在 127.0.0.1:8010 跑着。没跑时 skip 而非 fail —— 让 npm test 在没有
 * 后端的机器上永远红，只会训练开发者忽略红色。发布前必须起着后端跑一次。
 */

const BACKEND = process.env.BACKEND_URL ?? 'http://127.0.0.1:8010'

/* 顶层 await，不是 beforeAll：it.skipIf(...) 在【收集阶段】求值，
   那时 beforeAll 还没跑，用它取 spec 会让下面几条永远 skip —— 一个从不执行的
   假测试。admin 那边曾经真的这么写错过一次，见 admin 的 contract.test.ts。 */
const codes: Record<string, number> | null = await (async () => {
  try {
    const res = await fetch(`${BACKEND}/openapi.json`)
    if (!res.ok) return null
    const spec = (await res.json()) as { info?: Record<string, unknown> }
    return (spec.info?.['x-error-codes'] as Record<string, number>) ?? null
  } catch {
    return null
  }
})()

describe('错误码与后端一致', () => {
  it.skipIf(!codes)('后端暴露了错误码全表', () => {
    expect(Object.keys(codes!).length).toBeGreaterThan(20)
  })

  it.skipIf(!codes)('前端登记的每个码都与后端相同', () => {
    // 前端刻意不抄全表 —— 只登记页面真正会分支判断的那些，
    // 所以「后端有而前端没有」是正常的，不是错误。
    const mine: Record<string, number> = {
      TOKEN_MISSING: CODE_TOKEN_MISSING,
      TOKEN_INVALID: CODE_TOKEN_INVALID,
      TOKEN_KIND_MISMATCH: CODE_TOKEN_KIND_MISMATCH,
      WX_CODE_INVALID: CODE_WX_CODE_INVALID,
      USER_NOT_FOUND: CODE_USER_NOT_FOUND,
      RECORD_LOCKED: CODE_RECORD_LOCKED,
      ART_WITHDRAWN: CODE_ART_WITHDRAWN,
    }
    for (const [name, value] of Object.entries(mine)) {
      expect(codes![name], `后端没有 ${name} 这个码`).toBeDefined()
      expect(codes![name], `${name} 的编号与后端不一致`).toBe(value)
    }
  })

  it.skipIf(!codes)('SESSION_DEAD_CODES 里的码后端都还在', () => {
    const values = new Set(Object.values(codes!))
    for (const code of SESSION_DEAD_CODES) {
      expect(values.has(code), `后端已无 ${code} 这个码，token 刷新会失灵`).toBe(true)
    }
  })
})
