import json

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.auth import current_admin
from app.core.db import get_session
from app.core.errors import ApiError
from app.repositories import admin as admin_repo
from app.schemas.admin import (
    AdminConfigResponse, ConfigChangeItem, ConfigDiffResponse, ConfigFieldError,
)
from app.services import admin_config

router = APIRouter(tags=["admin"])


@router.get("/config", response_model=AdminConfigResponse)
async def read_config(_=Depends(current_admin),
                      session: AsyncSession = Depends(get_session)):
    row = await admin_repo.get_app_config(session)
    return AdminConfigResponse(
        config=await admin_config.current_dict(session),
        updated_by=row.updated_by if row else None,
        updated_at=row.updated_at if row else None)


@router.put(
    "/config",
    responses={
        200: {"model": ConfigDiffResponse,
              "description": "dry_run=true 时返回 diff；否则返回保存后的配置"},
    },
    # 请求体刻意是裸 dict（见下），OpenAPI 里靠这里补回真实形状，
    # 否则 /docs 完全不描述这 42 个字段，前端契约测试也无从比对。
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/AdminConfigPayload"},
                },
            },
        },
    },
)
async def write_config(payload: dict,
                       dry_run: bool = Query(False),
                       admin=Depends(current_admin),
                       session: AsyncSession = Depends(get_session)):
    """dry_run=true 时只算 diff 不写库；否则校验后写库。

    刻意接收裸 dict 而非 AdminConfigPayload：dry-run 需要把校验错误当成
    **数据**返回给前端逐字段标红，而不是让 FastAPI 直接抛 422。
    """
    if dry_run:
        changes, errors = await admin_config.preview(session, payload)
        return ConfigDiffResponse(
            changes=[
                ConfigChangeItem.model_validate(
                    {"path": c.path, "from": c.old, "to": c.new})
                for c in changes
            ],
            valid=not errors,
            errors=[ConfigFieldError(**e) for e in errors])

    normalized, errors = admin_config.validate(payload)
    if normalized is None:
        raise ApiError("CONFIG_INVALID")
    row = await admin_config.save(session, normalized, admin.username)
    await session.commit()
    return AdminConfigResponse(config=normalized, updated_by=row.updated_by,
                               updated_at=row.updated_at)


@router.get("/config/export")
async def export_config(_=Depends(current_admin),
                        session: AsyncSession = Depends(get_session)):
    """下载当前配置的 JSON 快照。改动前手动存一份，是「单行覆盖」的唯一后悔药。"""
    data = await admin_config.current_dict(session)
    body = json.dumps(data, ensure_ascii=False, indent=2)
    return Response(
        content=body, media_type="application/json",
        headers={"Content-Disposition":
                 'attachment; filename="zhusheng-config.json"'})
