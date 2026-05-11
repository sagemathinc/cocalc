"""
OAuth2 authentication for the CoCalc API client.

Supports two modes:
  - native:       Spawns a local HTTP server to receive the callback (RFC 8252).
                  Uses PKCE instead of client_secret.
  - confidential: Server-side app with a client_secret (no local server needed,
                  requires manual code entry or pre-configured redirect).

Tokens are stored in ~/.config/cocalc-api/auth.json (access token, metadata).
The refresh token is stored in the system keyring when available, falling
back to the same JSON file.
"""

import hashlib
import json
import os
import platform
import secrets
import sys
import time
import urllib.parse
import webbrowser
from base64 import urlsafe_b64encode
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import threading
from threading import Event, Thread
from typing import Any, Optional

import httpx


def _normalize_host(host: str) -> str:
    """Normalize a host URL for comparison (strip trailing slash, lowercase)."""
    return host.rstrip("/").lower()


# ---------------------------------------------------------------------------
# Config directory
# ---------------------------------------------------------------------------

_APP_NAME = "cocalc-api"


def _config_dir() -> Path:
    """Platform-aware config directory."""
    if platform.system() == "Darwin":
        base = Path.home() / "Library" / "Application Support"
    elif platform.system() == "Windows":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    d = base / _APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def _auth_file() -> Path:
    return _config_dir() / "auth.json"


def _userinfo_file() -> Path:
    return _config_dir() / "userinfo.json"


# ---------------------------------------------------------------------------
# Keyring helpers (optional dependency)
# ---------------------------------------------------------------------------

_KEYRING_SERVICE = "cocalc-api-oauth2"


def _keyring_available() -> bool:
    """Check if keyring is importable AND has a working backend."""
    try:
        import keyring

        # Probe the backend — raises NoKeyringError on headless/CI systems
        keyring.get_credential("__cocalc_probe__", None)
        return True
    except Exception:
        return False


def _store_refresh_token(host: str, token: str) -> None:
    """Store refresh token in system keyring, or fall back to file."""
    if _keyring_available():
        try:
            import keyring

            keyring.set_password(_KEYRING_SERVICE, host, token)
            return
        except Exception:
            pass
    # Fall back: store in auth.json (less secure)
    data = _load_auth()
    data["refresh_token"] = token
    _save_auth(data)


def _load_refresh_token(host: str) -> Optional[str]:
    """Load refresh token from system keyring, or fall back to file."""
    if _keyring_available():
        try:
            import keyring

            val = keyring.get_password(_KEYRING_SERVICE, host)
            if val is not None:
                return val
        except Exception:
            pass
    data = _load_auth()
    return data.get("refresh_token")


def _delete_refresh_token(host: str) -> None:
    if _keyring_available():
        try:
            import keyring

            keyring.delete_password(_KEYRING_SERVICE, host)
        except Exception:
            pass
    data = _load_auth()
    data.pop("refresh_token", None)
    _save_auth(data)


_KEYRING_SECRET_SERVICE = "cocalc-api-secret"


def _store_client_secret(host: str, secret: str) -> None:
    """Store client_secret in system keyring, or fall back to file."""
    if _keyring_available():
        try:
            import keyring

            keyring.set_password(_KEYRING_SECRET_SERVICE, host, secret)
            return
        except Exception:
            pass
    # Fall back: store in auth.json (less secure)
    data = _load_auth()
    data["client_secret"] = secret
    _save_auth(data)


def _load_client_secret(host: str) -> Optional[str]:
    """Load client_secret from system keyring, or fall back to file."""
    if _keyring_available():
        try:
            import keyring

            val = keyring.get_password(_KEYRING_SECRET_SERVICE, host)
            if val is not None:
                return val
        except Exception:
            pass
    data = _load_auth()
    return data.get("client_secret")


def _delete_client_secret(host: str) -> None:
    if _keyring_available():
        try:
            import keyring
            keyring.delete_password(_KEYRING_SECRET_SERVICE, host)
        except keyring.errors.PasswordDeleteError:
            pass
    data = _load_auth()
    data.pop("client_secret", None)
    _save_auth(data)


# ---------------------------------------------------------------------------
# Auth file I/O
# ---------------------------------------------------------------------------


def _load_auth() -> dict[str, Any]:
    f = _auth_file()
    if f.exists():
        return json.loads(f.read_text())
    return {}


def _save_auth(data: dict[str, Any]) -> None:
    f = _auth_file()
    f.write_text(json.dumps(data, indent=2, default=str) + "\n")
    # Restrict permissions on Unix
    if platform.system() != "Windows":
        f.chmod(0o600)


def _load_userinfo() -> dict[str, Any]:
    f = _userinfo_file()
    if f.exists():
        return json.loads(f.read_text())
    return {}


def _save_userinfo(data: dict[str, Any]) -> None:
    f = _userinfo_file()
    f.write_text(json.dumps(data, indent=2, default=str) + "\n")
    if platform.system() != "Windows":
        f.chmod(0o600)


# ---------------------------------------------------------------------------
# PKCE helpers (RFC 7636)
# ---------------------------------------------------------------------------


def _generate_pkce() -> tuple[str, str]:
    """Generate PKCE code_verifier and code_challenge (S256)."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


# ---------------------------------------------------------------------------
# Native mode: local callback server
# ---------------------------------------------------------------------------


class _CallbackHandler(BaseHTTPRequestHandler):
    """HTTP handler that captures the OAuth2 authorization code."""

    code: Optional[str] = None
    state: Optional[str] = None
    error: Optional[str] = None
    received = Event()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        _CallbackHandler.code = params.get("code", [None])[0]
        _CallbackHandler.state = params.get("state", [None])[0]
        _CallbackHandler.error = params.get("error", [None])[0]
        _CallbackHandler.received.set()

        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        if _CallbackHandler.error:
            self.wfile.write(b"<h2>Authorization failed.</h2><p>You can close this tab.</p>")
        else:
            self.wfile.write(b"<h2>Authorization successful!</h2><p>You can close this tab.</p>")

    def log_message(self, format, *args):
        pass  # suppress log output


def _run_callback_server(port: int = 0) -> tuple[HTTPServer, int]:
    """Start a local HTTP server and return (server, port).

    If port is 0, binds to an ephemeral port >= 10000 (per RFC 8252,
    the OS assigns an available port for native app redirects).
    """
    if port == 0:
        # Let the OS pick a free port, but request one >= 10000
        import socket

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
            # If the OS gave us a low port, just use it — it's free
    server = HTTPServer(("127.0.0.1", port), _CallbackHandler)
    actual_port = server.server_address[1]
    thread = Thread(target=server.handle_request, daemon=True)
    thread.start()
    return server, actual_port


# ---------------------------------------------------------------------------
# Token exchange
# ---------------------------------------------------------------------------


def _exchange_code(
    host: str,
    code: str,
    client_id: str,
    redirect_uri: str,
    client_secret: Optional[str] = None,
    code_verifier: Optional[str] = None,
) -> dict[str, Any]:
    """Exchange authorization code for tokens."""
    data: dict[str, str] = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id,
        "redirect_uri": redirect_uri,
    }
    if client_secret:
        data["client_secret"] = client_secret
    if code_verifier:
        data["code_verifier"] = code_verifier

    resp = httpx.post(f"{host}/auth/oauth/token", data=data, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


def _refresh_tokens(
    host: str,
    refresh_token: str,
    client_id: str,
    client_secret: Optional[str] = None,
) -> dict[str, Any]:
    """Use a refresh token to get new tokens."""
    data: dict[str, str] = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
    }
    if client_secret:
        data["client_secret"] = client_secret

    resp = httpx.post(f"{host}/auth/oauth/token", data=data, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Userinfo
# ---------------------------------------------------------------------------


def _fetch_userinfo(host: str, access_token: str) -> dict[str, Any]:
    """Fetch userinfo from the OAuth2 provider and store it locally."""
    resp = httpx.get(
        f"{host}/auth/oauth/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30.0,
    )
    resp.raise_for_status()
    info = resp.json()
    # Store with metadata
    stored = {
        "host": host,
        "fetched_at": int(time.time()),
        **info,
    }
    _save_userinfo(stored)
    return info


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def login(
    host: str,
    client_id: str,
    client_secret: Optional[str] = None,
    scopes: str = "openid profile email",
    port: int = 0,
) -> dict[str, Any]:
    """
    Perform OAuth2 login and store tokens.

    Args:
        host: CoCalc instance URL (e.g. "https://cocalc.com").
        client_id: OAuth2 client ID.
        client_secret: Client secret (for confidential/web mode). If None,
                      uses native mode with PKCE.
        scopes: Space-separated scopes to request.
        port: Local port for native callback server (0 = auto).

    Returns:
        Token response dict with access_token, refresh_token, etc.
    """
    # Reset class-level state from any previous login() call
    _CallbackHandler.code = None
    _CallbackHandler.state = None
    _CallbackHandler.error = None
    _CallbackHandler.received = threading.Event()

    state = secrets.token_urlsafe(32)

    if client_secret:
        # Confidential mode: try local callback server first (like native),
        # using http://127.0.0.1 as the redirect. If the callback times out
        # or if the user prefers, they can manually paste the code.
        server, actual_port = _run_callback_server(port)
        redirect_uri = f"http://127.0.0.1:{actual_port}/authorize/"

        auth_url = (f"{host}/auth/oauth/authorize?" + urllib.parse.urlencode({
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scopes,
            "state": state,
            "device_name": platform.node() or "unknown",
        }))

        print(f"Opening browser for authorization...\n  {auth_url}")
        webbrowser.open(auth_url)

        if not _CallbackHandler.received.wait(timeout=120):
            server.server_close()
            raise TimeoutError("Authorization timed out (120s)")
        server.server_close()

        if _CallbackHandler.error:
            raise RuntimeError(f"Authorization failed: {_CallbackHandler.error}")
        if _CallbackHandler.state != state:
            raise RuntimeError("State mismatch — possible CSRF attack")

        code = _CallbackHandler.code
        if not code:
            raise RuntimeError("No authorization code received")

        tokens = _exchange_code(host, code, client_id, redirect_uri, client_secret=client_secret)
    else:
        # Native mode: local callback server + PKCE
        code_verifier, code_challenge = _generate_pkce()
        server, actual_port = _run_callback_server(port)
        # Use 127.0.0.1 (not "localhost") to match the server binding
        # and avoid IPv6 mismatch on systems where localhost → ::1.
        redirect_uri = f"http://127.0.0.1:{actual_port}/authorize/"

        auth_url = (f"{host}/auth/oauth/authorize?" + urllib.parse.urlencode({
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scopes,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "device_name": platform.node() or "unknown",
        }))

        print(f"Opening browser for authorization...\n  {auth_url}")
        webbrowser.open(auth_url)

        # Wait for callback
        if not _CallbackHandler.received.wait(timeout=120):
            server.server_close()
            raise TimeoutError("Authorization timed out (120s)")
        server.server_close()

        if _CallbackHandler.error:
            raise RuntimeError(f"Authorization failed: {_CallbackHandler.error}")
        if _CallbackHandler.state != state:
            raise RuntimeError("State mismatch — possible CSRF attack")

        code = _CallbackHandler.code
        if not code:
            raise RuntimeError("No authorization code received")

        tokens = _exchange_code(host, code, client_id, redirect_uri, code_verifier=code_verifier)

    # Store tokens (normalize host for consistent matching)
    auth_data = {
        "host": _normalize_host(host),
        "client_id": client_id,
        "mode": "confidential" if client_secret else "native",
        "access_token": tokens["access_token"],
        "token_type": tokens.get("token_type", "Bearer"),
        "expires_in": tokens.get("expires_in"),
        "scope": tokens.get("scope", scopes),
        "obtained_at": int(time.time()),
    }
    _save_auth(auth_data)

    if client_secret:
        _store_client_secret(host, client_secret)
    else:
        # Native mode: clear any stale client_secret from a prior
        # confidential login on this host to avoid refresh failures.
        _delete_client_secret(host)

    if tokens.get("refresh_token"):
        _store_refresh_token(host, tokens["refresh_token"])

    # Fetch and store userinfo
    try:
        _fetch_userinfo(host, tokens["access_token"])
    except Exception:
        pass  # non-fatal: userinfo fetch may fail if scope doesn't include profile

    return tokens


def get_token(host: Optional[str] = None, client_id: Optional[str] = None) -> Optional[str]:
    """
    Get a valid access token, refreshing if necessary.

    Returns None if no stored auth or refresh fails.
    """
    data = _load_auth()
    if not data.get("access_token"):
        return None

    stored_host = _normalize_host(data.get("host", ""))
    if host and _normalize_host(host) != stored_host:
        return None

    # Check if access token is still valid (with 60s buffer)
    obtained = data.get("obtained_at", 0)
    expires_in = data.get("expires_in", 3600)
    if time.time() < obtained + expires_in - 60:
        return data["access_token"]

    # Try to refresh
    refresh_token = _load_refresh_token(stored_host)
    if not refresh_token:
        return None

    cid = client_id or data.get("client_id", "")
    csecret = _load_client_secret(stored_host)

    try:
        tokens = _refresh_tokens(stored_host, refresh_token, cid, client_secret=csecret)
    except Exception:
        return None

    # Update stored auth
    data["access_token"] = tokens["access_token"]
    data["expires_in"] = tokens.get("expires_in", 3600)
    data["obtained_at"] = int(time.time())
    _save_auth(data)

    if tokens.get("refresh_token"):
        _store_refresh_token(stored_host, tokens["refresh_token"])

    return tokens["access_token"]


def refresh(host: Optional[str] = None, client_id: Optional[str] = None) -> dict[str, Any]:
    """
    Force a token refresh using the stored refresh token.

    Unlike get_token() which only refreshes when the access token is expired,
    this always performs a refresh and returns the full token response.

    Returns:
        Dict with old_access_token, new_access_token, old_refresh_token,
        new_refresh_token, and rotated flag.

    Raises:
        RuntimeError: If no refresh token is available or refresh fails.
    """
    data = _load_auth()
    if not data.get("access_token"):
        raise RuntimeError("Not authenticated. Run: cocalc-api auth login")

    stored_host = host or data.get("host", "")
    cid = client_id or data.get("client_id", "")
    csecret = _load_client_secret(stored_host)

    old_refresh = _load_refresh_token(stored_host)
    if not old_refresh:
        raise RuntimeError("No refresh token available")

    old_access = data["access_token"]

    tokens = _refresh_tokens(stored_host, old_refresh, cid, client_secret=csecret)

    new_access = tokens["access_token"]
    new_refresh = tokens.get("refresh_token", old_refresh)
    rotated = new_refresh != old_refresh

    # Update stored auth
    data["access_token"] = new_access
    data["expires_in"] = tokens.get("expires_in", 3600)
    data["obtained_at"] = int(time.time())
    _save_auth(data)

    if tokens.get("refresh_token"):
        _store_refresh_token(stored_host, tokens["refresh_token"])

    # Re-fetch userinfo with the new access token
    try:
        _fetch_userinfo(stored_host, new_access)
    except Exception:
        pass

    return {
        "old_access_token": old_access,
        "new_access_token": new_access,
        "old_refresh_token": old_refresh,
        "new_refresh_token": new_refresh,
        "rotated": rotated,
        "expires_in": tokens.get("expires_in", 3600),
    }


def whoami() -> Optional[dict[str, Any]]:
    """
    Fetch userinfo from the server. Falls back to cache if server is unreachable.

    Returns None if not authenticated.
    """
    data = _load_auth()
    if not data.get("access_token"):
        return None

    host = data.get("host", "")
    # Use get_token() to auto-refresh if expired
    token = get_token(host=host)
    if not token:
        # Can't refresh — try cache
        info = _load_userinfo()
        if info.get("sub"):
            info["_cached"] = True
            return info
        return None
    try:
        return _fetch_userinfo(host, token)
    except Exception:
        # Server unreachable or token revoked — try cache
        info = _load_userinfo()
        if info.get("sub"):
            info["_cached"] = True
            return info
        return None


def logout(host: Optional[str] = None) -> None:
    """Clear stored tokens, userinfo, and revoke if possible."""
    data = _load_auth()
    stored_host = host or data.get("host", "")

    # Try to revoke access token and refresh token server-side
    if stored_host and data.get("client_id"):
        client_id = data["client_id"]
        if data.get("access_token"):
            try:
                httpx.post(
                    f"{stored_host}/auth/oauth/revoke",
                    data={"token": data["access_token"], "client_id": client_id},
                    timeout=10.0,
                )
            except Exception:
                pass
        refresh_tok = _load_refresh_token(stored_host)
        if refresh_tok:
            try:
                httpx.post(
                    f"{stored_host}/auth/oauth/revoke",
                    data={"token": refresh_tok, "client_id": client_id},
                    timeout=10.0,
                )
            except Exception:
                pass

    _delete_refresh_token(stored_host)
    _delete_client_secret(stored_host)

    # Clear auth file
    f = _auth_file()
    if f.exists():
        f.unlink()

    # Clear userinfo
    f = _userinfo_file()
    if f.exists():
        f.unlink()

    print("Logged out.")


def status() -> None:
    """Print current auth status, verifying the token with the server."""
    data = _load_auth()
    if not data.get("access_token"):
        print("Not authenticated.")
        print(f"Run: cocalc-api auth login --host <URL> --client-id <ID>")
        return

    host = data.get("host", "?")
    mode = data.get("mode", "?")
    scope = data.get("scope", "?")
    obtained = data.get("obtained_at", 0)
    expires_in = data.get("expires_in", 0)
    remaining = max(0, int(obtained + expires_in - time.time()))

    # Verify token is still valid server-side
    server_valid = False
    if host != "?" and remaining > 0:
        try:
            resp = httpx.get(
                f"{host}/auth/oauth/userinfo",
                headers={"Authorization": f"Bearer {data['access_token']}"},
                timeout=10.0,
            )
            server_valid = resp.status_code == 200
        except Exception:
            pass

    print(f"Host:          {host}")
    print(f"Mode:          {mode}")
    print(f"Scope:         {scope}")
    if remaining > 0 and server_valid:
        print(f"Access token:  valid ({remaining}s remaining)")
    elif remaining > 0:
        print(f"Access token:  REVOKED (token was revoked server-side)")
    else:
        print(f"Access token:  EXPIRED")

    refresh = _load_refresh_token(host)
    if refresh:
        storage = "keyring" if _keyring_available() else "file"
        print(f"Refresh token: stored ({storage})")
    else:
        print(f"Refresh token: none")

    info = _load_userinfo()
    if info.get("sub"):
        print(f"User:          {info.get('name', '?')} <{info.get('email', '?')}> (sub={info['sub']})")
    else:
        print(f"User:          unknown (run 'cocalc-api auth whoami' to fetch)")

    print(f"Config:        {_auth_file()}")
