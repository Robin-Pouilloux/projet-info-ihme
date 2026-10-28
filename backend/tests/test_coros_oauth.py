from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from app import coros_oauth
from app.main import app


@pytest.fixture
def client():
    coros_oauth.reset_state_for_tests()
    with TestClient(app) as test_client:
        yield test_client
    coros_oauth.reset_state_for_tests()


def test_authorization_start_registers_public_client_and_uses_pkce(client, monkeypatch):
    registration_requests = []

    def fake_request(method, url, **kwargs):
        if method == "GET":
            return httpx.Response(
                200,
                json={
                    "response_types_supported": ["code"],
                    "grant_types_supported": ["authorization_code", "refresh_token"],
                    "code_challenge_methods_supported": ["S256"],
                    "scopes_supported": ["openid", "mcp.tools", "offline_access"],
                    "authorization_endpoint": "https://mcpeu.coros.com/oauth2/authorize",
                    "token_endpoint": "https://mcpeu.coros.com/oauth2/token",
                    "registration_endpoint": "https://mcpeu.coros.com/connect/register",
                },
            )
        registration_requests.append(kwargs["json"])
        return httpx.Response(
            201,
            json={
                "client_id": "test-client",
                "token_endpoint_auth_method": "none",
                "redirect_uris": kwargs["json"]["redirect_uris"],
            },
        )

    monkeypatch.setattr(coros_oauth, "_request", fake_request)
    response = client.get("/api/coros/auth/start", follow_redirects=False)

    assert response.status_code == 303
    registration = registration_requests[0]
    assert registration["redirect_uris"] == ["http://localhost:8001/api/coros/oauth/callback"]
    assert registration["token_endpoint_auth_method"] == "none"
    assert registration["scope"] == "openid mcp.tools offline_access"

    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["client_id"] == ["test-client"]
    assert query["response_type"] == ["code"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["openid mcp.tools offline_access"]
    state = query["state"][0]
    pending = coros_oauth._pending[state]
    expected_challenge = coros_oauth.base64.urlsafe_b64encode(
        coros_oauth.hashlib.sha256(pending.verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")
    assert query["code_challenge"] == [expected_challenge]


def test_callback_rejects_unknown_state_without_exchanging_code(client, monkeypatch):
    def unexpected_request(*args, **kwargs):
        pytest.fail("A callback with an invalid state must not call the OAuth token endpoint.")

    monkeypatch.setattr(coros_oauth, "_request", unexpected_request)
    response = client.get("/api/coros/oauth/callback?state=unknown&code=secret-code")

    assert response.status_code == 400
    assert "secret-code" not in response.text


def test_mcp_request_uses_bearer_token_without_logging_it(monkeypatch, caplog):
    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, *, json, headers):
            assert url == "https://mcp.coros.com/mcp"
            assert headers["Authorization"] == "Bearer test-access-token"
            return httpx.Response(200, headers={"content-type": "application/json"}, json={"result": {}})

    monkeypatch.setattr(coros_oauth.httpx, "Client", lambda **kwargs: FakeClient())
    response, session_id = coros_oauth._mcp_post(
        mcp_url="https://mcp.coros.com/mcp",
        access_token="test-access-token",
        payload={"jsonrpc": "2.0", "id": 1, "method": "initialize"},
    )

    assert response == {"result": {}}
    assert session_id is None
    assert "test-access-token" not in caplog.text


def test_callback_exchanges_code_and_calls_only_read_activity_tool(client, monkeypatch, caplog):
    token_requests = []
    mcp_requests = []

    def fake_request(method, url, **kwargs):
        if method == "GET":
            return httpx.Response(
                200,
                json={
                    "response_types_supported": ["code"],
                    "grant_types_supported": ["authorization_code", "refresh_token"],
                    "code_challenge_methods_supported": ["S256"],
                    "scopes_supported": ["openid", "mcp.tools", "offline_access"],
                    "authorization_endpoint": "https://mcpeu.coros.com/oauth2/authorize",
                    "token_endpoint": "https://mcpeu.coros.com/oauth2/token",
                    "registration_endpoint": "https://mcpeu.coros.com/connect/register",
                },
            )
        if url.endswith("/connect/register"):
            return httpx.Response(
                201,
                json={"client_id": "test-client", "token_endpoint_auth_method": "none"},
            )
        token_requests.append(kwargs["data"])
        return httpx.Response(
            200,
            json={"access_token": "simulated-access-token", "token_type": "Bearer", "expires_in": 3600},
        )

    def fake_mcp_post(*, mcp_url, access_token, payload, session_id=None):
        assert access_token == "simulated-access-token"
        mcp_requests.append(payload)
        if payload["method"] == "initialize":
            return {"result": {"protocolVersion": "2025-03-26"}}, "test-session"
        if payload["method"] == "notifications/initialized":
            return {}, session_id
        if payload["method"] == "tools/list":
            return {"result": {"tools": [{"name": "querySportRecords"}]}}, session_id
        assert payload["method"] == "tools/call"
        assert payload["params"]["name"] == "querySportRecords"
        return {"result": {"content": [{"type": "text", "text": "No activities found."}]}}, session_id

    monkeypatch.setattr(coros_oauth, "_request", fake_request)
    monkeypatch.setattr(coros_oauth, "_mcp_post", fake_mcp_post)
    start = client.get("/api/coros/auth/start", follow_redirects=False)
    params = parse_qs(urlparse(start.headers["location"]).query)
    state = params["state"][0]
    verifier = coros_oauth._pending[state].verifier

    callback = client.get(
        "/api/coros/oauth/callback",
        params={"state": state, "code": "simulated-authorization-code"},
    )

    assert callback.status_code == 200
    assert "appel MCP de lecture" in callback.text
    assert token_requests[0]["grant_type"] == "authorization_code"
    assert token_requests[0]["code"] == "simulated-authorization-code"
    assert token_requests[0]["client_id"] == "test-client"
    assert token_requests[0]["code_verifier"] == verifier
    assert [message["method"] for message in mcp_requests] == [
        "initialize",
        "notifications/initialized",
        "tools/list",
        "tools/call",
    ]

    status = client.get("/api/coros/auth/status")
    assert status.status_code == 200
    assert status.json()["connected"] is True
    assert "access_token" not in status.text
    assert "simulated-access-token" not in status.text
    assert "simulated-access-token" not in caplog.text


def test_status_marks_expired_access_token_as_disconnected(client):
    now = datetime.now(timezone.utc)
    coros_oauth._connection = coros_oauth.CorosConnection(
        access_token="expired-test-token",
        expires_at=0,
        mcp_url="https://mcp.coros.com/mcp",
        session_id=None,
        connected_at=now,
        last_activity_read_at=now,
    )

    response = client.get("/api/coros/auth/status")

    assert response.status_code == 200
    assert response.json()["connected"] is False
    assert response.json()["status"] == "token_expired"
    assert "expired-test-token" not in response.text
