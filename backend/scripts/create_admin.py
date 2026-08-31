"""创建/重置管理员账号。

阶段二不提供注册接口，也不提供改密接口——一个能改全局配置的后台，
自助注册就是把门拆了。建号与改密都走这个脚本，需要服务器 shell 权限。

    .venv/bin/python -m scripts.create_admin <username>
    .venv/bin/python -m scripts.create_admin <username> --reset

密码从 stdin 交互读取（getpass），不落命令行历史。
"""

import asyncio
import getpass
import sys
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.db import SessionFactory
from app.core.password import MAX_PASSWORD_BYTES, MIN_PASSWORD_LEN, hash_password
from app.models import AdminUser



def _read_password() -> str:
    prompt = "密码：" if MIN_PASSWORD_LEN <= 1 else f"密码（至少 {MIN_PASSWORD_LEN} 位）："
    first = getpass.getpass(prompt)
    if not first:
        sys.exit("密码不能为空。")
    if len(first) < MIN_PASSWORD_LEN:
        sys.exit(f"密码太短，至少 {MIN_PASSWORD_LEN} 位。")
    if len(first.encode("utf-8")) > MAX_PASSWORD_BYTES:
        sys.exit(f"密码超过 {MAX_PASSWORD_BYTES} 字节（bcrypt 上限，中文一字 3 字节）。")
    if first != getpass.getpass("再输一次："):
        sys.exit("两次输入不一致。")
    return first


async def _main(username: str, reset: bool) -> None:
    password = _read_password()
    async with SessionFactory() as session:
        existing = await session.scalar(
            select(AdminUser).where(AdminUser.username == username))
        if existing is not None and not reset:
            sys.exit(f"管理员 {username!r} 已存在。要改密码请加 --reset。")
        if existing is not None:
            existing.hashed_password = hash_password(password)
            existing.is_active = True
            # 与后台的自助改密一致：作废改密之前签发的所有 token
            existing.password_changed_at = datetime.now(timezone.utc)
            action = "已重置密码（该账号已登录的会话全部失效）"
        else:
            session.add(AdminUser(username=username,
                                  hashed_password=hash_password(password)))
            action = "已创建"
        await session.commit()
    print(f"管理员 {username!r} {action}。")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--reset"]
    if len(args) != 1:
        sys.exit("用法：python -m scripts.create_admin <username> [--reset]")
    asyncio.run(_main(args[0], "--reset" in sys.argv[1:]))
