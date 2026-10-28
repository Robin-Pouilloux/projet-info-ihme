import base64
import hashlib
import json
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import settings

router = APIRouter(prefix="/api/coros", tags=["COROS"])

_OAUTH_METADATA_PATH = "/.well-known/oauth-authorization-server"
_OAUTH_SCOPE = "openid mcp.tools offline_access"
_MCP_PROTOCOL_VERSION = "2025-03-26"
_PENDING_TTL_SECONDS = 600


@dataclass
class PendingAuthorization:
    verifier: str
    redirect_uri: str
    client_id: str
    authorization_endpoint: str
    token_endpoint: str
    mcp_url: str
    expires_at: float


@dataclass
class CorosConnection:
    access_token: str
    expires_at: float | None
    mcp_url: str
    session_id: str | None
    connected_at: datetime
    last_activity_read_at: datetime


_lock = threading.Lock()
_pending: dict[str, PendingAuthorization] = {}
_connection: CorosConnection | None = None


class OAuthProviderError(Exception):
    pass


class MCPProviderError(Exception):
    pass


def _request(method: str, url: str, **kwargs: Any) -> httpx.Response:
    try:
        with httpx.Client(timeout=20, follow_redirects=False) as client:
            response = client.request(method, url, **kwargs)
    except httpx.HTTPError as error:
        raise OAuthProviderError from error
    if response.is_error:
        raise OAuthProviderError
    return response


def _read_json(response: httpx.Response) -> dict[str, Any]:
    try:
        value = response.json()
    except (ValueError, json.JSONDecodeError) as error:
        raise OAuthProviderError from error
    if not isinstance(value, dict):
        raise OAuthProviderError
    return value


def _https_url(value: Any) -> str:
    if not isinstance(value, str):
        raise OAuthProviderError
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        raise OAuthProviderError
    return value


def _oauth_metadata(mcp_url: str) -> dict[str, Any]:
    parsed = urlparse(mcp_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise OAuthProviderError
    base = f"{parsed.scheme}://{parsed.netloc}"
    metadata = _read_json(_request("GET", f"{base}{_OAUTH_METADATA_PATH}"))
    if "code" not in metadata.get("response_types_supported", []):
        raise OAuthProviderError
    if "authorization_code" not in metadata.get("grant_types_supported", []):
        raise OAuthProviderError
    if "S256" not in metadata.get("code_challenge_methods_supported", []):
        raise OAuthProviderError
    if not set(_OAUTH_SCOPE.split()).issubset(set(metadata.get("scopes_supported", []))):
        raise OAuthProviderError
    metadata["authorization_endpoint"] = _https_url(metadata.get("authorization_endpoint"))
    metadata["token_endpoint"] = _https_url(metadata.get("token_endpoint"))
    metadata["registration_endpoint"] = _https_url(metadata.get("registration_endpoint"))
    return metadata


def _register_public_client(metadata: dict[str, Any], redirect_uri: str) -> str:
    response = _request(
        "POST",
        metadata["registration_endpoint"],
        json={
            "client_name": "GearTrack local prototype",
            "application_type": "web",
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
            "scope": _OAUTH_SCOPE,
        },
        headers={"Accept": "application/json"},
    )
    registration = _read_json(response)
    if registration.get("token_endpoint_auth_method") != "none":
        raise OAuthProviderError
    client_id = registration.get("client_id")
    if not isinstance(client_id, str) or not client_id:
        raise OAuthProviderError
    return client_id


def _prune_pending(now: float) -> None:
    expired = [state for state, item in _pending.items() if item.expires_at <= now]
    for state in expired:
        _pending.pop(state, None)


@router.get("/auth/start")
def start_authorization():
    try:
        metadata = _oauth_metadata(settings.coros_mcp_url)
        client_id = _register_public_client(metadata, settings.coros_redirect_uri)
    except OAuthProviderError as error:
        raise HTTPException(
            status_code=502,
            detail="COROS n'a pas pu préparer l'autorisation OAuth. Vérifiez la disponibilité de COROS et réessayez.",
        ) from error

    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    pending = PendingAuthorization(
        verifier=verifier,
        redirect_uri=settings.coros_redirect_uri,
        client_id=client_id,
        authorization_endpoint=metadata["authorization_endpoint"],
        token_endpoint=metadata["token_endpoint"],
        mcp_url=settings.coros_mcp_url,
        expires_at=time.time() + _PENDING_TTL_SECONDS,
    )
    with _lock:
        _prune_pending(time.time())
        _pending[state] = pending
    authorization_query = urlencode({
        'response_type': 'code',
        'client_id': pending.client_id,
        'redirect_uri': pending.redirect_uri,
        'scope': _OAUTH_SCOPE,
        'state': state,
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
    })
    authorization_url = f"{pending.authorization_endpoint}?{authorization_query}"
    return RedirectResponse(authorization_url, status_code=303)


def _take_pending(state: str) -> PendingAuthorization | None:
    with _lock:
        _prune_pending(time.time())
        return _pending.pop(state, None)


def _exchange_code(pending: PendingAuthorization, code: str) -> dict[str, Any]:
    response = _request(
        "POST",
        pending.token_endpoint,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": pending.redirect_uri,
            "client_id": pending.client_id,
            "code_verifier": pending.verifier,
        },
        headers={"Accept": "application/json"},
    )
    token_response = _read_json(response)
    if not isinstance(token_response.get("access_token"), str):
        raise OAuthProviderError
    token_type = token_response.get("token_type")
    if not isinstance(token_type, str) or token_type.lower() != "bearer":
        raise OAuthProviderError
    return token_response


def _parse_mcp_response(response: httpx.Response) -> dict[str, Any]:
    if response.is_error:
        raise MCPProviderError
    content_type = response.headers.get("content-type", "")
    try:
        if "application/json" in content_type:
            value = response.json()
            return value if isinstance(value, dict) else {}
        if "text/event-stream" in content_type:
            messages = [
                json.loads(line.removeprefix("data:").strip())
                for line in response.text.splitlines()
                if line.startswith("data:") and line.removeprefix("data:").strip()
            ]
            if messages and isinstance(messages[-1], dict):
                return messages[-1]
    except (ValueError, json.JSONDecodeError) as error:
        raise MCPProviderError from error
    if response.status_code in (202, 204):
        return {}
    raise MCPProviderError


def _mcp_post(
    *,
    mcp_url: str,
    access_token: str,
    payload: dict[str, Any],
    session_id: str | None = None,
) -> tuple[dict[str, Any], str | None]:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if payload.get("method") != "initialize":
        headers["MCP-Protocol-Version"] = _MCP_PROTOCOL_VERSION
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    try:
        with httpx.Client(timeout=30, follow_redirects=False) as client:
            response = client.post(mcp_url, json=payload, headers=headers)
    except httpx.HTTPError as error:
        raise MCPProviderError from error
    message = _parse_mcp_response(response)
    if message.get("error"):
        raise MCPProviderError
    return message, response.headers.get("Mcp-Session-Id", session_id)


def _call_activity_read(access_token: str, mcp_url: str) -> str | None:
    init_message, session_id = _mcp_post(
        mcp_url=mcp_url,
        access_token=access_token,
        payload={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": _MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "GearTrack", "version": "0.1.0"},
            },
        },
    )
    if not init_message.get("result"):
        raise MCPProviderError

    _mcp_post(
        mcp_url=mcp_url,
        access_token=access_token,
        session_id=session_id,
        payload={"jsonrpc": "2.0", "method": "notifications/initialized"},
    )
    tools_message, session_id = _mcp_post(
        mcp_url=mcp_url,
        access_token=access_token,
        session_id=session_id,
        payload={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )
    tools = tools_message.get("result", {}).get("tools", [])
    if not any(tool.get("name") == "querySportRecords" for tool in tools if isinstance(tool, dict)):
        raise MCPProviderError

    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    activities_message, _ = _mcp_post(
        mcp_url=mcp_url,
        access_token=access_token,
        session_id=session_id,
        payload={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "querySportRecords",
                "arguments": {
                    "startDate": start_date.strftime("%Y%m%d"),
                    "endDate": end_date.strftime("%Y%m%d"),
                    "limit": 20,
                },
            },
        },
    )
    result = activities_message.get("result")
    if not isinstance(result, dict) or result.get("isError"):
        raise MCPProviderError
    return session_id


@router.get("/oauth/callback", response_class=HTMLResponse)
def authorization_callback(
    state: str = Query(min_length=1, max_length=128),
    code: str | None = Query(default=None, max_length=4096),
    error: str | None = Query(default=None, max_length=128),
):
    pending = _take_pending(state)
    if pending is None:
        raise HTTPException(status_code=400, detail="Autorisation expirée ou état OAuth invalide. Recommencez la connexion.")
    if error or not code:
        raise HTTPException(status_code=400, detail="L'autorisation COROS a été refusée ou n'a pas abouti.")

    try:
        token_response = _exchange_code(pending, code)
        expires_in = token_response.get("expires_in")
        expires_at = time.time() + expires_in if isinstance(expires_in, (int, float)) else None
        access_token = token_response["access_token"]
        session_id = _call_activity_read(access_token, pending.mcp_url)
    except (OAuthProviderError, MCPProviderError, httpx.HTTPError) as error:
        raise HTTPException(
            status_code=502,
            detail="L'échange OAuth ou l'appel MCP de lecture a échoué. Vérifiez la configuration COROS et réessayez.",
        ) from error

    now = datetime.now(timezone.utc)
    global _connection
    with _lock:
        _connection = CorosConnection(
            access_token=access_token,
            expires_at=expires_at,
            mcp_url=pending.mcp_url,
            session_id=session_id,
            connected_at=now,
            last_activity_read_at=now,
        )
    return HTMLResponse(
        "<!doctype html><html lang='fr'><meta charset='utf-8'><title>GearTrack — COROS connecté</title>"
        "<body><h1>Connexion COROS autorisée</h1>"
        "<p>L'appel MCP de lecture des activités a réussi. Les activités ne sont pas importées dans GearTrack.</p>"
        "<p>Vous pouvez fermer cette fenêtre et consulter le statut de connexion dans GearTrack.</p></body></html>"
    )


@router.get("/auth/status")
def authorization_status():
    with _lock:
        connection = _connection
    if connection is None:
        return {"connected": False, "status": "not_connected", "last_activity_read_at": None}
    if connection.expires_at is not None and connection.expires_at <= time.time():
        return {
            "connected": False,
            "status": "token_expired",
            "last_activity_read_at": connection.last_activity_read_at,
        }
    return {
        "connected": True,
        "status": "connected",
        "connected_at": connection.connected_at,
        "last_activity_read_at": connection.last_activity_read_at,
    }


def reset_state_for_tests() -> None:
    global _connection
    with _lock:
        _pending.clear()
        _connection = None
