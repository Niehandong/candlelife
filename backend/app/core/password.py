"""管理员密码哈希。

直接用 bcrypt，不经 passlib：passlib 1.7.4 已无维护，且与 bcrypt 5.x 不兼容
（首次 hash 即在 detect_wrap_bug 抛 ValueError）。我们只用一种算法，
CryptContext 那层包装没有收益。
"""

import bcrypt

# bcrypt 的硬上限，超出会抛 ValueError。注意是字节不是字符：中文一字 3 字节。
# 这是算法约束，不是策略，不要动。
MAX_PASSWORD_BYTES = 72

# 密码长度下限。【这是策略，只有这一处定义】——
# 后台自助改密（schemas/admin.py、services/admin_auth.py）与建号脚本
# （scripts/create_admin.py）都读它，要恢复限制只改这个数字。
#
# 当前设为 1（等于不限制），用户要求暂时取消 12 位下限、后续再加回来。
# 注意：这个后台能改全局配置且开发期绑在 0.0.0.0 上，上线前应当调回 12 以上。
#
# 前端 admin/src/auth/ChangePasswordDialog.tsx 里另有一份同名常量 ——
# 两个前端与后端刻意不共享代码，改这里记得同步那一处。
MIN_PASSWORD_LEN = 1


def hash_password(plain: str) -> str:
    raw = plain.encode("utf-8")
    if len(raw) > MAX_PASSWORD_BYTES:
        raise ValueError(
            f"密码不得超过 {MAX_PASSWORD_BYTES} 字节（当前 {len(raw)}）。"
            "这是 bcrypt 的硬上限，中文一字算 3 字节。"
        )
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """校验失败一律返回 False。

    库里存了坏值、或密码超长时 bcrypt 会抛 ValueError；那是「验不过」，
    不是「服务器错误」，绝不能冒泡成 500。
    """
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False
