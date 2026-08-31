async def test_config_exposes_ritual_parameters(client):
    body = (await client.get("/api/v1/config")).json()
    assert body["schedule"]["bedtime"] == "23:30"
    assert body["schedule"]["wake_time"] == "07:30"
    assert body["schedule"]["min_time"] == "20:00"     # 资格窗口下界
    assert body["schedule"]["max_time"] == "02:00"     # 跨午夜上界
    assert body["ritual"]["tolerance_minutes"] == 30
    assert body["ritual"]["gratitude_count"] == 3
    assert len(body["ritual"]["resistance_options"]) == 4


async def test_config_is_public(client):
    """未登录也能拿到配置——小程序启动即需要。"""
    assert (await client.get("/api/v1/config")).status_code == 200


async def test_config_never_leaks_secrets(client):
    text = (await client.get("/api/v1/config")).text.lower()
    for leak in ("fernet", "jwt", "secret", "password", "appid", "database", "postgres"):
        assert leak not in text, f"配置接口泄露了 {leak}"


async def test_config_matches_domain_defaults(client):
    """接口返回值必须与 domain 判定实际使用的常量一致，否则端上倒计时会算错。"""
    from app.domain.config import DEFAULT_CONFIG
    body = (await client.get("/api/v1/config")).json()
    assert body["ritual"]["tolerance_minutes"] == DEFAULT_CONFIG.ritual.tolerance_minutes
    assert body["schedule"]["min_time"] == DEFAULT_CONFIG.schedule.min_time.strftime("%H:%M")


async def test_config_exposes_asset_base_url(client):
    """小程序不得硬编码资源域名——由配置下发。"""
    body = (await client.get("/api/v1/config")).json()
    assert body["assets"]["base_url"].startswith("http")


async def test_asset_base_url_matches_settings(client):
    from app.core.config import get_settings
    body = (await client.get("/api/v1/config")).json()
    assert body["assets"]["base_url"] == get_settings().asset_base_url.rstrip("/")
