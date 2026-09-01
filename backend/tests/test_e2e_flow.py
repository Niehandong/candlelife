"""端到端功能验收：覆盖整个项目的用户旅程与全部 7 处规则修正。

这是交付前的总体功能性测试，与各任务的单元/接口测试互补：
单元测试证明零件对，本文件证明装起来能跑。
"""
from datetime import datetime

import pytest
from sqlalchemy import func, select

from app.core import codes
from app.models import AnalyticsEvent, ArtWork, NightRecord, Reward, User
from scripts.art_seed_data import ART_SEED
from tests.conftest import body, err, failed

# 未鉴权时可能出现的三种业务码，都在 401xx 段
TOKEN_ERRORS = {codes.TOKEN_MISSING, codes.TOKEN_INVALID,
                codes.TOKEN_KIND_MISMATCH}


def freeze(monkeypatch, iso: str):
    """冻结时间。

    只有【一个】patch 点 —— 当前时刻统一从 app.core.clock.now() 取。
    原先 nights 与 rewards 两个路由模块各有一份 _now()，这里要 patch 两处，
    漏一处就得到「一半冻住一半没冻」的诡异状态。
    """
    dt = datetime.fromisoformat(iso)
    monkeypatch.setattr("app.core.clock.now", lambda: dt)


@pytest.fixture
async def seeded_art(session):
    """把真实的 10 幅 seed 作品灌进测试 schema。"""
    for row in ART_SEED:
        session.add(ArtWork(**row))
    await session.flush()
    return ART_SEED


# ---------------------------------------------------------------- 主旅程

async def test_full_journey_login_to_reward(auth_client, session, seeded_art, monkeypatch):
    """登录 → 设置 → 完成仪式 → 次日揭晓 → 收藏 → 夜记 → 注销。"""
    # 1. 新用户拿到默认设置
    me = body(await auth_client.get("/api/v1/me"))
    assert me["settings"]["bedtime"] == "23:30"

    # 2. 公开配置可取（小程序启动即需要）
    cfg = body(await auth_client.get("/api/v1/config"))
    assert cfg["ritual"]["tolerance_minutes"] == 30

    # 3. 按时完成仪式
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:50:00+08:00",
        "gratitudes": ["感谢今天的阳光", "感谢一顿好饭"],
        "plans": ["明天早起", "把报告写完"],
        "resistance_reason": "我还在刷手机"})
    assert body(r) == {"ritual_date": "2026-08-27", "is_eligible": True,
                        "late_minutes": 20, "streak": 1}

    # 4. 当晚不可揭晓
    freeze(monkeypatch, "2026-08-27T23:55:00+08:00")
    assert body(await auth_client.get("/api/v1/rewards/pending"))["revealable"] is False
    assert body(await auth_client.post("/api/v1/rewards/reveal"))["rewards"] == []

    # 5. 次日 06:00 后揭晓
    freeze(monkeypatch, "2026-08-28T07:30:00+08:00")
    assert body(await auth_client.get("/api/v1/rewards/pending"))["revealable"] is True
    rewards = body(await auth_client.post("/api/v1/rewards/reveal"))["rewards"]
    assert len(rewards) == 1
    art_id = rewards[0]["art"]["id"]
    assert rewards[0]["art"]["image"].startswith("http")

    # 6. 收藏可见
    col = body(await auth_client.get("/api/v1/collection"))
    assert col["total_cards"] == 1 and col["unique_works"] == 1

    # 7. 作品详情含文章与来源
    detail = body(await auth_client.get(f"/api/v1/art/{art_id}"))
    assert len(detail["article"]) >= 40 and "http" in detail["source"]

    # 8. 夜记正文可读，且库里是密文
    night = body(await auth_client.get("/api/v1/nights/2026-08-27"))
    assert night["gratitudes"] == ["感谢今天的阳光", "感谢一顿好饭"]
    assert night["resistance_reason"] == "我还在刷手机"
    row = await session.scalar(select(NightRecord))
    assert "感谢今天的阳光".encode() not in bytes(row.gratitudes_enc)

    # 9. 上报匿名事件
    assert (await auth_client.post("/api/v1/events", json={"events": [
        {"type": "reward_revealed", "payload": {"draws": 1},
         "occurred_at": "2026-08-28T07:30:00+08:00"}]})).status_code == 200

    # 10. 注销后一切清空
    assert body(await auth_client.delete("/api/v1/me")) is None
    for model in (User, NightRecord, Reward, AnalyticsEvent):
        assert await session.scalar(select(func.count()).select_from(model)) == 0, model.__name__


async def test_thirty_night_journey_milestones(auth_client, session, seeded_art, monkeypatch):
    """连续 30 晚的完整激励曲线：里程碑与满月后的基础双抽。"""
    for day in range(1, 31):
        d = f"2026-09-{day:02d}"
        r = await auth_client.post("/api/v1/nights/complete", json={
            "completed_at": f"{d}T23:40:00+08:00", "gratitudes": [], "plans": []})
        assert body(r)["streak"] == day, f"第 {day} 晚"

    freeze(monkeypatch, "2026-10-01T09:00:00+08:00")
    rewards = body(await auth_client.post("/api/v1/rewards/reveal"))["rewards"]

    # 第 1–13 晚基础 1 抽（含里程碑 3、7 各 +1）= 15
    # 第 14 晚基础 2 + 里程碑 1 = 3
    # 第 15–29 晚基础 2 抽 = 30
    # 第 30 晚基础 2 + 里程碑 1 = 3
    assert len(rewards) == 15 + 3 + 30 + 3 == 51

    by_night = {}
    for row in (await session.scalars(select(NightRecord))).all():
        by_night[row.ritual_date.day] = row.reward_draw_count
    assert by_night[1] == 1 and by_night[2] == 1
    assert by_night[3] == 2 and by_night[7] == 2         # 里程碑
    assert by_night[13] == 1                             # 门槛前，基础 1
    assert by_night[14] == 3                             # 门槛当晚：基础 2 + 里程碑 1
    assert by_night[15] == 2 and by_night[29] == 2       # 门槛后基础 2
    assert by_night[30] == 3                             # 基础 2 + 里程碑 1


# ---------------------------------------------------------------- 7 处修正

async def test_correction_1_reveal_window_uniform(auth_client, session, seeded_art, monkeypatch):
    """修正 1：凌晨完成者与常规完成者同日揭晓，不再多等一天。"""
    await auth_client.put("/api/v1/me/settings", json={
        "bedtime": "00:30", "wake_time": "08:00",
        "timezone": "Asia/Shanghai", "reduced_motion": False})
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-28T00:45:00+08:00", "gratitudes": [], "plans": []})
    assert body(r)["ritual_date"] == "2026-08-27"      # 归属前一晚

    freeze(monkeypatch, "2026-08-28T05:59:00+08:00")
    assert body(await auth_client.get("/api/v1/rewards/pending"))["revealable"] is False
    freeze(monkeypatch, "2026-08-28T06:00:00+08:00")
    assert body(await auth_client.get("/api/v1/rewards/pending"))["revealable"] is True


async def test_correction_2_streak_decays(auth_client):
    """修正 2：停用多日后连续按时归零，不再停留在旧值。"""
    await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-01T23:40:00+08:00", "gratitudes": [], "plans": []})
    await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-02T23:40:00+08:00", "gratitudes": [], "plans": []})
    # 隔 18 天再来，连续应从 1 重新开始
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-20T23:40:00+08:00", "gratitudes": [], "plans": []})
    assert body(r)["streak"] == 1


async def test_correction_3_eligibility_window(auth_client):
    """修正 3：下午刷完流程不合格；提前入睡但在窗口内合格。"""
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T17:30:00+08:00", "gratitudes": [], "plans": []})
    assert body(r)["is_eligible"] is False          # 原型此处会判为合格

    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-28T21:00:00+08:00", "gratitudes": [], "plans": []})
    assert body(r)["is_eligible"] is True           # 提前 2.5 小时，仍在窗口内


async def test_correction_4_incentive_curve(auth_client, session, seeded_art, monkeypatch):
    """修正 4 的实际效果——本测试钉死激励曲线的交叉点，勿删。

    方案 2 初版把基础双抽门槛定在 30 晚，实测发现前 37 晚故意断签仍更划算
    （第 30 晚：刷法 40 抽 vs 坚持 35 抽），交叉点远在第 38 晚。
    门槛降至 14 晚后，交叉点提前到**第 16 晚**并此后持续成立。

    若日后调整规则使交叉点变化，此处会失败，
    应同步更新 CONTEXT.md、spec 与 shared/ritual-cases.json。
    """
    from app.domain.ritual import reward_draw_count as d

    def cont(N):
        return sum(d(n) for n in range(1, N + 1))

    def gaming(N, cycle):
        full, rem = divmod(N, cycle)
        return full * sum(d(n) for n in range(1, cycle + 1)) + \
            sum(d(n) for n in range(1, rem + 1))

    def best_gaming(N):
        return max(gaming(N, c) for c in (3, 7, 14))

    # 门槛后每晚稳定 2 抽
    assert d(13) == 1 and d(14) == 3 and d(15) == 2
    assert d(31) == 2 and d(45) == 2

    # 交叉点在第 16 晚，且此后持续成立（不是昙花一现的单点反超）
    crossover = next(N for N in range(1, 300)
                     if all(cont(M) > best_gaming(M) for M in range(N, N + 40)))
    assert crossover == 16, (
        f"激励曲线交叉点变为第 {crossover} 晚（应为 16）。"
        "这是产品规则变更，须同步更新 CONTEXT.md / spec / ritual-cases.json。")

    # 长期差距持续拉大
    assert cont(30) == 51 and best_gaming(30) == 40
    assert cont(60) > best_gaming(60) and cont(90) > best_gaming(90)


async def test_correction_5_backend_rejects_draft(auth_client):
    """修正 5：草稿是端上概念，后端不接收任何草稿字段。"""
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:40:00+08:00", "gratitudes": [], "plans": [],
        "draft": {"gratitudes": ["草稿内容"]}})
    failed(r, codes.UNPROCESSABLE)


async def test_correction_6_timezone_explicit(auth_client):
    """修正 6：判定随用户时区，而非服务器时区。"""
    await auth_client.put("/api/v1/me/settings", json={
        "bedtime": "23:30", "wake_time": "07:30",
        "timezone": "America/New_York", "reduced_motion": False})
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:45:00-04:00", "gratitudes": [], "plans": []})
    assert body(r) == {"ritual_date": "2026-08-27", "is_eligible": True,
                        "late_minutes": 15, "streak": 1}


async def test_correction_7_text_editable_within_window(auth_client, monkeypatch):
    """修正 7：揭晓窗口开启前可改正文，之后固化。"""
    await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:40:00+08:00",
        "gratitudes": ["写错了"], "plans": []})

    freeze(monkeypatch, "2026-08-28T05:00:00+08:00")
    assert (await auth_client.patch("/api/v1/nights/2026-08-27",
            json={"gratitudes": ["改好了"], "plans": []})).status_code == 200
    assert body(await auth_client.get(
        "/api/v1/nights/2026-08-27"))["gratitudes"] == ["改好了"]

    freeze(monkeypatch, "2026-08-28T06:00:00+08:00")
    failed(await auth_client.patch("/api/v1/nights/2026-08-27",
           json={"gratitudes": ["太晚了"], "plans": []}), codes.RECORD_LOCKED)


# ---------------------------------------------------------------- 横切关注

async def test_all_write_endpoints_require_auth(client):
    """未登录不得触达任何用户数据。"""
    cases = [
        ("get", "/api/v1/me", None),
        ("post", "/api/v1/nights/complete",
         {"completed_at": "2026-08-27T23:40:00+08:00", "gratitudes": [], "plans": []}),
        ("get", "/api/v1/nights", None),
        ("post", "/api/v1/rewards/reveal", None),
        ("get", "/api/v1/collection", None),
        ("delete", "/api/v1/me", None),
    ]
    # 循环变量不叫 body —— 那是 conftest 里读信封载荷的 helper 名
    for method, path, payload in cases:
        r = await getattr(client, method)(path, **({"json": payload} if payload else {}))
        assert err(r) in TOKEN_ERRORS, f"{method.upper()} {path} 未鉴权"


async def test_users_are_isolated(client, session, seeded_art, monkeypatch):
    """A 的夜记与奖励，B 一概看不见。"""
    a = await client.post("/api/v1/auth/wx-login", json={"code": "user-a"})
    b = await client.post("/api/v1/auth/wx-login", json={"code": "user-b"})
    ha = {"Authorization": f"Bearer {body(a)['access_token']}"}
    hb = {"Authorization": f"Bearer {body(b)['access_token']}"}

    await client.post("/api/v1/nights/complete", headers=ha, json={
        "completed_at": "2026-08-27T23:40:00+08:00",
        "gratitudes": ["A 的私人内容"], "plans": []})

    assert body(await client.get("/api/v1/nights", headers=hb))["items"] == []
    failed(await client.get("/api/v1/nights/2026-08-27", headers=hb),
           codes.NIGHT_NOT_FOUND)
    assert body(await client.get("/api/v1/collection", headers=hb))["total_cards"] == 0

    freeze(monkeypatch, "2026-08-28T07:00:00+08:00")
    assert body(await client.post("/api/v1/rewards/reveal", headers=hb))["rewards"] == []
    assert len(body(await client.post("/api/v1/rewards/reveal", headers=ha))["rewards"]) == 1


async def test_no_endpoint_leaks_private_text_or_secrets(auth_client, seeded_art, monkeypatch):
    """遍历所有 GET 接口，响应体不得含凭证或连接串。"""
    await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:40:00+08:00",
        "gratitudes": ["私人内容"], "plans": []})
    freeze(monkeypatch, "2026-08-28T07:00:00+08:00")
    await auth_client.post("/api/v1/rewards/reveal")

    from app.core.config import get_settings
    s = get_settings()
    # 真实机密从配置读取，绝不硬编码进测试文件
    secrets_to_check = [v.lower() for v in (
        s.redis_password, s.jwt_secret, s.fernet_key_list[0],
        s.database_url.split("://", 1)[-1].split("@")[0],   # user:password
    ) if v]
    generic = ["openid", "session_key", "postgresql://", "fernet", "jwt_secret"]

    for path in ["/api/v1/me", "/api/v1/config", "/api/v1/nights",
                 "/api/v1/collection", "/api/v1/rewards/pending", "/health"]:
        text = (await auth_client.get(path)).text.lower()
        for leak in generic + secrets_to_check:
            assert leak not in text, f"{path} 泄露了机密片段"


async def test_openapi_matches_spec_endpoints(client):
    """接口清单与 spec 第六节一致。"""
    spec = (await client.get("/openapi.json")).json()
    expected = {
        ("post", "/api/v1/auth/wx-login"), ("post", "/api/v1/auth/refresh"),
        ("get", "/api/v1/me"), ("patch", "/api/v1/me"), ("delete", "/api/v1/me"),
        ("put", "/api/v1/me/settings"),
        ("post", "/api/v1/nights/complete"), ("get", "/api/v1/nights"),
        ("get", "/api/v1/nights/{ritual_date}"), ("patch", "/api/v1/nights/{ritual_date}"),
        ("get", "/api/v1/rewards/pending"), ("post", "/api/v1/rewards/reveal"),
        ("get", "/api/v1/collection"), ("get", "/api/v1/art/{art_id}"),
        ("get", "/api/v1/config"), ("post", "/api/v1/events"),
    }
    actual = {(m, p) for p, ms in spec["paths"].items() for m in ms}
    assert expected <= actual, f"缺少接口：{sorted(expected - actual)}"
