"""后台的艺术作品管理。"""
import uuid

import pytest

from app.core.password import hash_password
from app.core.security import create_admin_token
from app.models import AdminUser, ArtWork

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _admin_headers(session, username="artadmin") -> dict:
    admin = AdminUser(username=username, hashed_password=hash_password("x" * 16))
    session.add(admin)
    await session.flush()
    return {"Authorization": f"Bearer {create_admin_token(admin.id)}"}


def _payload(art_id="test-work") -> dict:
    return {
        "id": art_id,
        "title": "睡莲",
        "artist": "克劳德·莫奈",
        "year": "1906",
        "thumbnail": "art/water-lilies-thumb.jpg",
        "image": "art/water-lilies.jpg",
        "alt": "一池睡莲浮在墨绿水面上",
        "source": "Public domain, via Wikimedia Commons",
        "article": "莫奈在吉维尼的花园里画了两百多幅睡莲。",
    }


async def _make_art(session, art_id="existing", active=True, withdrawn=False) -> ArtWork:
    art = ArtWork(**{**_payload(art_id), "is_active": active,
                     "is_withdrawn": withdrawn})
    session.add(art)
    await session.flush()
    return art


# ---------- 列表 ----------

async def test_list_requires_admin_token(client):
    r = await client.get("/api/v1/admin/art")
    assert r.status_code == 401


async def test_list_includes_inactive_and_withdrawn(client, session):
    """后台要能看见全部三种状态——只看得见上架的后台没法把作品救回来。"""
    h = await _admin_headers(session)
    await _make_art(session, "up")
    await _make_art(session, "down", active=False)
    await _make_art(session, "gone", withdrawn=True)
    r = await client.get("/api/v1/admin/art", headers=h)
    assert r.status_code == 200
    ids = {i["id"] for i in r.json()["items"]}
    assert {"up", "down", "gone"} <= ids
    assert r.json()["total"] >= 3


async def test_list_filters_by_status(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "s-up")
    await _make_art(session, "s-down", active=False)
    await _make_art(session, "s-gone", withdrawn=True)

    up = await client.get("/api/v1/admin/art?status=active", headers=h)
    assert {i["id"] for i in up.json()["items"]} == {"s-up"}

    down = await client.get("/api/v1/admin/art?status=inactive", headers=h)
    assert {i["id"] for i in down.json()["items"]} == {"s-down"}

    gone = await client.get("/api/v1/admin/art?status=withdrawn", headers=h)
    assert {i["id"] for i in gone.json()["items"]} == {"s-gone"}


async def test_list_searches_title_and_artist(client, session):
    h = await _admin_headers(session)
    art = await _make_art(session, "q-target")
    art.title = "星夜"
    art.artist = "文森特·梵高"
    await session.flush()
    await _make_art(session, "q-other")

    by_title = await client.get("/api/v1/admin/art?q=星夜", headers=h)
    assert {i["id"] for i in by_title.json()["items"]} == {"q-target"}

    by_artist = await client.get("/api/v1/admin/art?q=梵高", headers=h)
    assert {i["id"] for i in by_artist.json()["items"]} == {"q-target"}


async def test_list_item_exposes_status_and_full_urls(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "shape")
    item = next(i for i in (await client.get("/api/v1/admin/art", headers=h)
                            ).json()["items"] if i["id"] == "shape")
    assert item["status"] == "active"
    assert item["thumbnail_url"].startswith("http")
    assert item["thumbnail"] == "art/water-lilies-thumb.jpg"   # 原始相对路径也要给


# ---------- 新增 ----------

async def test_create_art(client, session):
    h = await _admin_headers(session)
    r = await client.post("/api/v1/admin/art", json=_payload("brand-new"), headers=h)
    assert r.status_code == 201
    assert r.json()["id"] == "brand-new"
    assert r.json()["status"] == "active"
    assert await session.get(ArtWork, "brand-new") is not None


async def test_create_rejects_duplicate_id(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "dup")
    r = await client.post("/api/v1/admin/art", json=_payload("dup"), headers=h)
    assert r.status_code == 409
    assert r.json()["code"] == "ART_ID_TAKEN"


@pytest.mark.parametrize("field", ["title", "artist", "year", "thumbnail",
                                   "image", "alt", "source", "article"])
async def test_create_rejects_blank_required_field(client, session, field):
    """8 个必填字段。数据库有 CHECK 约束，但要在应用层挡住给出可读错误。"""
    h = await _admin_headers(session, f"blank-{field}")
    data = _payload(f"blank-{field}")
    data[field] = "   "
    r = await client.post("/api/v1/admin/art", json=data, headers=h)
    assert r.status_code == 422


async def test_create_rejects_bad_slug(client, session):
    h = await _admin_headers(session)
    r = await client.post("/api/v1/admin/art",
                          json=_payload("Not A Slug!"), headers=h)
    assert r.status_code == 422


async def test_create_requires_admin_token(client):
    r = await client.post("/api/v1/admin/art", json=_payload())
    assert r.status_code == 401


# ---------- 修改与状态流转 ----------

async def test_patch_updates_metadata(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "edit-me")
    r = await client.patch("/api/v1/admin/art/edit-me",
                           json={"title": "睡莲·黄昏"}, headers=h)
    assert r.status_code == 200
    assert r.json()["title"] == "睡莲·黄昏"
    assert r.json()["artist"] == "克劳德·莫奈"      # 未提交的字段不变


async def test_patch_deactivates_and_reactivates(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "toggle")
    off = await client.patch("/api/v1/admin/art/toggle",
                             json={"is_active": False}, headers=h)
    assert off.json()["status"] == "inactive"
    on = await client.patch("/api/v1/admin/art/toggle",
                            json={"is_active": True}, headers=h)
    assert on.json()["status"] == "active"


async def test_patch_withdraws(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "withdraw-me")
    r = await client.patch("/api/v1/admin/art/withdraw-me",
                           json={"is_withdrawn": True}, headers=h)
    assert r.json()["status"] == "withdrawn"


async def test_withdrawn_art_leaves_the_draw_pool(client, session):
    """状态改动必须真的影响抽卡池，不只是个标签。"""
    from app.repositories import art as art_repo
    h = await _admin_headers(session)
    await _make_art(session, "pool-check")
    assert "pool-check" in {a.id for a in await art_repo.active_pool(session)}
    await client.patch("/api/v1/admin/art/pool-check",
                       json={"is_withdrawn": True}, headers=h)
    assert "pool-check" not in {a.id for a in await art_repo.active_pool(session)}


async def test_patch_rejects_unknown_field(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "strict")
    r = await client.patch("/api/v1/admin/art/strict",
                           json={"titel": "拼错了"}, headers=h)
    assert r.status_code == 422


async def test_patch_missing_art_returns_404(client, session):
    h = await _admin_headers(session)
    r = await client.patch("/api/v1/admin/art/no-such-work",
                           json={"title": "x"}, headers=h)
    assert r.status_code == 404
    assert r.json()["code"] == "ART_NOT_FOUND"


# ---------- 删除 ----------

async def test_delete_unused_art(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "delete-me")
    r = await client.delete("/api/v1/admin/art/delete-me", headers=h)
    assert r.status_code == 204
    assert await session.get(ArtWork, "delete-me") is None


async def test_delete_collected_art_returns_409(client, session):
    """rewards.art_id 是 ON DELETE RESTRICT。数据库会拒绝，我们把它翻成 409。"""
    from datetime import date, datetime, timezone

    from app.models import NightRecord, Reward, User
    h = await _admin_headers(session)
    await _make_art(session, "collected")

    user = User(openid=f"admin-art-{uuid.uuid4().hex}")
    session.add(user)
    await session.flush()
    planned = datetime(2026, 8, 30, 23, 30, tzinfo=timezone.utc)
    night = NightRecord(user_id=user.id, ritual_date=date(2026, 8, 30),
                        planned_at=planned, completed_at=planned,
                        is_eligible=True, late_minutes=0, reward_draw_count=1)
    session.add(night)
    await session.flush()
    session.add(Reward(user_id=user.id, night_record_id=night.id, art_id="collected",
                       awarded_at=datetime.now(timezone.utc)))
    await session.flush()

    r = await client.delete("/api/v1/admin/art/collected", headers=h)
    assert r.status_code == 409
    assert r.json()["code"] == "ART_IN_USE"
    assert await session.get(ArtWork, "collected") is not None    # 没被删掉


async def test_delete_missing_art_returns_404(client, session):
    h = await _admin_headers(session)
    r = await client.delete("/api/v1/admin/art/nope", headers=h)
    assert r.status_code == 404


async def test_delete_requires_admin_token(client, session):
    await _make_art(session, "protected")
    r = await client.delete("/api/v1/admin/art/protected")
    assert r.status_code == 401


# ---------- 分页 ----------

async def _make_many(session, n: int, prefix="page") -> None:
    for i in range(n):
        await _make_art(session, f"{prefix}-{i:03d}")


async def test_list_is_paginated_with_defaults(client, session):
    """默认每页 20 条。作品库会长到上百幅，一次全吐会让页面变得没法用。"""
    h = await _admin_headers(session, "pg-default")
    await _make_many(session, 25)
    r = await client.get("/api/v1/admin/art", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 20
    assert body["page"] == 1
    assert body["page_size"] == 20
    assert body["total"] >= 25          # total 是「符合条件的总数」，不是本页条数
    assert body["pages"] >= 2


async def test_second_page_has_different_items(client, session):
    h = await _admin_headers(session, "pg-second")
    await _make_many(session, 25, "second")
    p1 = (await client.get("/api/v1/admin/art?page=1&page_size=10", headers=h)).json()
    p2 = (await client.get("/api/v1/admin/art?page=2&page_size=10", headers=h)).json()
    assert len(p1["items"]) == 10
    assert len(p2["items"]) == 10
    assert not ({i["id"] for i in p1["items"]} & {i["id"] for i in p2["items"]})
    assert p1["total"] == p2["total"]


async def test_page_beyond_last_returns_empty_not_error(client, session):
    """翻过最后一页给空列表，不是 404 —— 删掉最后一页的作品后前端可能就在那一页。"""
    h = await _admin_headers(session, "pg-beyond")
    await _make_art(session, "only-one")
    r = await client.get("/api/v1/admin/art?page=99&page_size=20", headers=h)
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["page"] == 99


async def test_total_counts_all_matches_not_just_this_page(client, session):
    h = await _admin_headers(session, "pg-total")
    await _make_many(session, 12, "tot")
    r = await client.get("/api/v1/admin/art?page=1&page_size=5", headers=h)
    body = r.json()
    assert len(body["items"]) == 5
    assert body["total"] >= 12
    assert body["pages"] == -(-body["total"] // 5)      # 向上取整


async def test_pagination_respects_filters(client, session):
    """筛选与分页要一起生效：total 是「筛选后」的总数。"""
    h = await _admin_headers(session, "pg-filter")
    await _make_many(session, 6, "act")
    for i in range(3):
        await _make_art(session, f"inact-{i}", active=False)
    r = await client.get("/api/v1/admin/art?status=inactive&page=1&page_size=2", headers=h)
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert all(i["status"] == "inactive" for i in body["items"])


async def test_pagination_respects_search(client, session):
    h = await _admin_headers(session, "pg-search")
    await _make_art(session, "needle-one")
    await _make_art(session, "needle-two")
    await _make_many(session, 5, "hay")
    r = await client.get("/api/v1/admin/art?q=needle&page_size=1", headers=h)
    assert r.json()["total"] == 2
    assert len(r.json()["items"]) == 1


@pytest.mark.parametrize("qs", ["page=0", "page=-1", "page_size=0", "page_size=201"])
async def test_invalid_pagination_params_rejected(client, session, qs):
    h = await _admin_headers(session, f"pg-bad-{qs.replace('=', '').replace('-', 'n')}")
    r = await client.get(f"/api/v1/admin/art?{qs}", headers=h)
    assert r.status_code == 422


async def test_ordering_is_stable_across_pages(client, session):
    """分页必须有确定的排序，否则翻页会重复或漏项。"""
    h = await _admin_headers(session, "pg-order")
    await _make_many(session, 15, "ord")
    ids = []
    for p in (1, 2, 3):
        ids += [i["id"] for i in
                (await client.get(f"/api/v1/admin/art?page={p}&page_size=5",
                                  headers=h)).json()["items"]]
    assert len(ids) == len(set(ids)), "翻页出现了重复项"
    assert ids == sorted(ids), "排序不稳定"


async def test_reward_counts_are_correct_on_a_page(client, session):
    """批量取收藏数（替掉每条一次查询的 N+1）后，数字仍要对。"""
    from datetime import date, datetime, timezone

    from app.models import NightRecord, Reward, User
    h = await _admin_headers(session, "pg-rewards")
    await _make_art(session, "rc-collected")
    await _make_art(session, "rc-clean")

    user = User(openid=f"pg-{uuid.uuid4().hex}")
    session.add(user)
    await session.flush()
    planned = datetime(2026, 8, 29, 23, 30, tzinfo=timezone.utc)
    night = NightRecord(user_id=user.id, ritual_date=date(2026, 8, 29),
                        planned_at=planned, completed_at=planned,
                        is_eligible=True, late_minutes=0, reward_draw_count=2)
    session.add(night)
    await session.flush()
    for _ in range(3):
        session.add(Reward(user_id=user.id, night_record_id=night.id,
                           art_id="rc-collected", awarded_at=planned))
    await session.flush()

    items = {i["id"]: i for i in
             (await client.get("/api/v1/admin/art?q=rc-&page_size=50",
                               headers=h)).json()["items"]}
    assert items["rc-collected"]["reward_count"] == 3
    assert items["rc-clean"]["reward_count"] == 0
