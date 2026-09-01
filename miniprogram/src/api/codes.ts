/**
 * 业务错误码。与后端 `backend/app/core/codes.py` 一一对应。
 *
 * 编号规则：**HTTP 状态码 + 两位序号**。40101 = 401 类的第 1 个。
 *
 * 只列页面真正会分支判断的那些 —— 其余一律走「显示 msg」的通用路径。
 * 加得越少，前后端要同步的东西越少。
 */

export const CODE_OK = 200

/** 网络层没走通（飞行模式、弱网、超时），后端根本没回话 —— 不是后端给的码 */
export const CODE_NETWORK_UNAVAILABLE = 0

// ── 401xx：登录相关 ──
export const CODE_TOKEN_MISSING = 40101
export const CODE_TOKEN_INVALID = 40102
export const CODE_TOKEN_KIND_MISMATCH = 40103
export const CODE_WX_CODE_INVALID = 40108
export const CODE_USER_NOT_FOUND = 40109

// ── 409xx：夜记锁定，journal-detail 页要特判 ──
export const CODE_RECORD_LOCKED = 40901

// ── 410xx ──
export const CODE_ART_WITHDRAWN = 41001

/**
 * 这些码意味着当前 access token 没用了，值得拿 refresh token 换一张再试。
 *
 * 后端 /api 下的 HTTP 状态一律 200，所以【不能再靠 res.statusCode === 401
 * 判断要不要刷新 token】——那正是这套码存在的直接原因。
 */
export const SESSION_DEAD_CODES: readonly number[] = [
  CODE_TOKEN_MISSING,
  CODE_TOKEN_INVALID,
  CODE_TOKEN_KIND_MISMATCH,
  CODE_USER_NOT_FOUND,
]

/**
 * 判断一个业务码是否意味着登录态失效。
 *
 * 接受 undefined —— 调用方常常是 `isSessionDead(err?.code)`，
 * 拿不到码时按「不是登录问题」处理，不去猜。
 */
export function isSessionDead(code: number | undefined): boolean {
  return code !== undefined && SESSION_DEAD_CODES.includes(code)
}
