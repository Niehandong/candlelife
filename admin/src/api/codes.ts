/**
 * 业务错误码。与后端 `backend/app/core/codes.py` 一一对应。
 *
 * 编号规则：**HTTP 状态码 + 两位序号**。40101 = 401 类的第 1 个。
 *
 * 只列前端真正会分支判断的那些 —— 其余错误码前端一律走「显示 msg」的通用路径，
 * 不需要在这里登记。加得越少，前后端要同步的东西越少。
 */

export const CODE_OK = 200

/** 网络层没走通（连不上、超时），后端根本没回话 —— 不是后端给的码 */
export const CODE_NETWORK = 0

// ── 401xx：登录相关。前端要区分「重新登录」和「密码打错了」 ──
export const CODE_TOKEN_MISSING = 40101
export const CODE_TOKEN_INVALID = 40102
export const CODE_TOKEN_KIND_MISMATCH = 40103
export const CODE_ADMIN_LOGIN_FAILED = 40104
export const CODE_ADMIN_NOT_FOUND = 40105
export const CODE_CURRENT_PASSWORD_WRONG = 40106
export const CODE_PASSWORD_CHANGED = 40107

// ── 403xx ──
export const CODE_ADMIN_INACTIVE = 40301

// ── 409xx：作品库的删除按钮靠它给提示 ──
export const CODE_ART_IN_USE = 40902
export const CODE_ART_ID_TAKEN = 40903

// ── 429xx ──
export const CODE_TOO_MANY_ATTEMPTS = 42901

/** 这些码意味着当前登录态没用了，应当清 token 回登录页 */
export const SESSION_DEAD_CODES: readonly number[] = [
  CODE_TOKEN_MISSING,
  CODE_TOKEN_INVALID,
  CODE_TOKEN_KIND_MISMATCH,
  CODE_ADMIN_NOT_FOUND,
  CODE_PASSWORD_CHANGED,
]
