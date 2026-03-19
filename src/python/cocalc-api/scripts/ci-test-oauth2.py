#!/usr/bin/env python3
"""
CI end-to-end test for the OAuth2 authentication flow.

Prerequisites (set by the CI workflow):
  - COCALC_HOST:       Hub URL (e.g. http://localhost:5000)
  - COCALC_API_KEY:    Admin API key (sk-...)
  - COCALC_ACCOUNT_ID: Admin account UUID
  - PGHOST, PGUSER, PGDATABASE: Postgres connection

Tests both client modes end-to-end:

  Part A — Confidential (web) client:
    1. Create client in DB
    2. Insert auth code (simulating user approval)
    3. Exchange code for tokens via /auth/oauth/token
    4. Verify access token at /auth/oauth/userinfo
    5. CLI: write stored auth → auth status → auth token
    6. CLI: auth refresh → verify NEW access token, SAME refresh token (no rotation)
    7. Verify refreshed token still works at userinfo
    8. Hub(oauth_token=...) API call
    9. CLI: auth logout

  Part B — Native (public) client with PKCE:
    1. Create client in DB
    2. Insert auth code with PKCE code_challenge
    3. Exchange code with code_verifier
    4. Verify wrong code_verifier is rejected
    5. Verify access token at /auth/oauth/userinfo
    6. CLI: write stored auth → auth status → auth token
    7. CLI: auth refresh → verify NEW access token, NEW refresh token (rotation)
    8. Verify rotated token still works at userinfo
    9. Hub(oauth_token=...) API call
    10. CLI: auth logout

  Part C — Error cases and OAuth2 server metadata discovery
"""

import hashlib
import json
import os
import secrets
import subprocess
import sys
import time
import uuid
from base64 import urlsafe_b64encode

import httpx
import psycopg2

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

HOST = os.environ.get("COCALC_HOST", "http://localhost:5000")
API_KEY = os.environ.get("COCALC_API_KEY", "")
ACCOUNT_ID = os.environ.get("COCALC_ACCOUNT_ID", "")

# Read account_id from file if not in env (CI stores it in src/account_id.txt)
if not ACCOUNT_ID:
    for path in ["../../account_id.txt", "../../../account_id.txt"]:
        try:
            ACCOUNT_ID = open(path).read().strip()
            break
        except FileNotFoundError:
            pass

assert HOST, "COCALC_HOST must be set"
assert API_KEY, "COCALC_API_KEY must be set"
assert ACCOUNT_ID, "COCALC_ACCOUNT_ID or account_id.txt must be available"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

passed = 0
failed = 0


def check(label: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS: {label}")
    else:
        failed += 1
        print(f"  FAIL: {label}" + (f" — {detail}" if detail else ""))


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def sha256_b64url(s: str) -> str:
    return urlsafe_b64encode(hashlib.sha256(s.encode("ascii")).digest()).rstrip(b"=").decode("ascii")


def cli(*args: str) -> subprocess.CompletedProcess:
    """Run: python -m cocalc_api.cli <args>"""
    return subprocess.run([sys.executable, "-m", "cocalc_api.cli"] + list(args), capture_output=True, text=True)


def db_connect():
    return psycopg2.connect(
        host=os.environ.get("PGHOST", "localhost"),
        user=os.environ.get("PGUSER", "smc"),
        dbname=os.environ.get("PGDATABASE", "smc"),
        password=os.environ.get("PGPASSWORD", ""),
    )


def create_client(cur, mode: str, redirect_uri: str) -> tuple[str, str, str]:
    """Create an OAuth2 client in the DB. Returns (client_id, secret, secret_hash)."""
    client_id = str(uuid.uuid4())
    client_secret = secrets.token_hex(48)
    client_secret_hash = sha256_hex(client_secret)
    cur.execute(
        """
        INSERT INTO oauth2_clients
            (client_id, client_secret_hash, name, description, mode,
             redirect_uris, grant_types, scopes, created_by, created, modified, active)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), true)
        """,
        [
            client_id,
            client_secret_hash,
            f"CI Test {mode} Client",
            f"OAuth2 E2E test — {mode} client",
            mode,
            json.dumps([redirect_uri]),
            json.dumps(["authorization_code", "refresh_token"]),
            json.dumps(["openid", "profile", "email", "api:read"]),
            ACCOUNT_ID,
        ],
    )
    return client_id, client_secret, client_secret_hash


def insert_auth_code(cur, client_id: str, redirect_uri: str, code_challenge: str = None, code_challenge_method: str = None) -> str:
    """Insert an authorization code directly in the DB. Returns the code."""
    code = secrets.token_hex(32)
    if code_challenge:
        cur.execute(
            """
            INSERT INTO oauth2_authorization_codes
                (code, client_id, account_id, redirect_uri, scope,
                 code_challenge, code_challenge_method, expire)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW() + INTERVAL '10 minutes')
            """,
            [code, client_id, ACCOUNT_ID, redirect_uri, "openid profile email api:read", code_challenge, code_challenge_method],
        )
    else:
        cur.execute(
            """
            INSERT INTO oauth2_authorization_codes
                (code, client_id, account_id, redirect_uri, scope, expire)
            VALUES (%s, %s, %s, %s, %s, NOW() + INTERVAL '10 minutes')
            """,
            [code, client_id, ACCOUNT_ID, redirect_uri, "openid profile email api:read"],
        )
    return code


def verify_userinfo(access_token: str, label_prefix: str = ""):
    """Hit /auth/oauth/userinfo and check the response."""
    resp = httpx.get(f"{HOST}/auth/oauth/userinfo", headers={"Authorization": f"Bearer {access_token}"}, timeout=30.0)
    check(f"{label_prefix}userinfo returns 200", resp.status_code == 200, f"got {resp.status_code}: {resp.text}")
    if resp.status_code == 200:
        info = resp.json()
        check(f"{label_prefix}sub matches account_id", info.get("sub") == ACCOUNT_ID)
        check(f"{label_prefix}email present", "email" in info)
    return resp.status_code == 200


def verify_stored_userinfo(label_prefix: str = ""):
    """Check that userinfo.json was stored correctly."""
    from cocalc_api.auth import _load_userinfo
    info = _load_userinfo()
    check(f"{label_prefix}userinfo.json exists and has sub", info.get("sub") == ACCOUNT_ID, f"got: {info}")
    check(f"{label_prefix}userinfo.json has email", "email" in info, f"got: {info}")
    check(f"{label_prefix}userinfo.json has name", "name" in info, f"got: {info}")
    check(f"{label_prefix}userinfo.json has fetched_at", "fetched_at" in info)
    return info


def setup_stored_auth(access_token: str, refresh_token: str, client_id: str, mode: str, client_secret: str = None):
    """Write tokens to the auth.json file and fetch userinfo."""
    from cocalc_api.auth import _save_auth, _store_refresh_token, _store_client_secret, _fetch_userinfo
    auth_data = {
        "host": HOST,
        "client_id": client_id,
        "mode": mode,
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": "openid profile email api:read",
        "obtained_at": int(time.time()),
    }
    _save_auth(auth_data)
    _store_refresh_token(HOST, refresh_token)
    if client_secret:
        _store_client_secret(HOST, client_secret)
    # Fetch and store userinfo
    try:
        _fetch_userinfo(HOST, access_token)
    except Exception as e:
        print(f"  WARNING: failed to fetch userinfo during setup: {e}")


# ---------------------------------------------------------------------------
# Connect to DB
# ---------------------------------------------------------------------------

conn = db_connect()
conn.autocommit = True
cur = conn.cursor()

# Track client IDs for cleanup
all_client_ids = []

# =========================================================================
# PART A: Confidential (web) client
# =========================================================================

print("\n" + "=" * 60)
print("PART A: Confidential (web) client")
print("=" * 60)

# --- A1: Create client ---
print("\n--- A1: Create confidential client ---")
web_redirect_uri = "http://127.0.0.1:19876/callback"
web_client_id, web_client_secret, _ = create_client(cur, "web", web_redirect_uri)
all_client_ids.append(web_client_id)
print(f"  Created: {web_client_id}")

# --- A2: Insert auth code and exchange ---
print("\n--- A2: Code exchange (client_secret) ---")
web_code = insert_auth_code(cur, web_client_id, web_redirect_uri)

resp = httpx.post(
    f"{HOST}/auth/oauth/token",
    data={
        "grant_type": "authorization_code",
        "code": web_code,
        "client_id": web_client_id,
        "client_secret": web_client_secret,
        "redirect_uri": web_redirect_uri,
    },
    timeout=30.0,
)
check("code exchange returns 200", resp.status_code == 200, f"got {resp.status_code}: {resp.text[:200]}")

if resp.status_code != 200:
    print(f"  FATAL: Cannot proceed without a valid token response. Aborting.")
    print(f"  Check that COCALC_SETTING_OAUTH2_PROVIDER_ENABLED=yes is set before hub starts.")
    # Try the metadata endpoint to check if provider is mounted
    try:
        disc = httpx.get(f"{HOST}/auth/.well-known/oauth-authorization-server", timeout=5.0)
        print(f"  OAuth2 metadata: {disc.status_code} {disc.text[:200]}")
    except Exception as e:
        print(f"  OAuth2 metadata failed: {e}")
    sys.exit(1)

web_tokens = resp.json()
check("access_token present", "access_token" in web_tokens)
check("refresh_token present", "refresh_token" in web_tokens)
check("token_type is Bearer", web_tokens.get("token_type") == "Bearer")
check("expires_in > 0", web_tokens.get("expires_in", 0) > 0)
check("scope matches request", web_tokens.get("scope") == "openid profile email api:read")

web_access = web_tokens.get("access_token", "")
web_refresh = web_tokens.get("refresh_token", "")

# --- A3: Verify userinfo ---
print("\n--- A3: Verify access token (userinfo) ---")
verify_userinfo(web_access, "web: ")

# --- A4: CLI setup and basic commands ---
print("\n--- A4: CLI — status, token, whoami ---")
setup_stored_auth(web_access, web_refresh, web_client_id, "confidential", web_client_secret)

# Verify userinfo was stored locally
verify_stored_userinfo("web setup: ")

r = cli("auth", "status")
check("CLI 'auth status' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")
check("CLI status shows 'confidential'", "confidential" in r.stdout, r.stdout)
check("CLI status shows user info", ACCOUNT_ID in r.stdout or "email" in r.stdout.lower(), r.stdout)

# Test whoami CLI
r = cli("auth", "whoami")
check("CLI 'auth whoami' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")
check("CLI whoami has sub", ACCOUNT_ID in r.stdout, r.stdout)
check("CLI whoami has email", "email" in r.stdout, r.stdout)

r = cli("auth", "token")
check("CLI 'auth token' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")
token_before = r.stdout.strip()
check("CLI token matches stored token", token_before == web_access)

# --- A5: CLI refresh (confidential → no rotation) ---
print("\n--- A5: CLI — auth refresh (no rotation expected) ---")
r = cli("auth", "refresh")
check("CLI 'auth refresh' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")
check("CLI refresh says 'reused'", "reused" in r.stdout.lower() or "Reused" in r.stdout, r.stdout)

# Get the new access token from the last line of output
refresh_output_lines = r.stdout.strip().split("\n")
new_web_access = refresh_output_lines[-1].strip()
check("new access token differs from old", new_web_access != web_access, f"old={web_access[:20]}... new={new_web_access[:20]}...")

# Verify the refresh token was NOT rotated (confidential mode)
from cocalc_api.auth import _load_refresh_token

stored_refresh = _load_refresh_token(HOST)
check("refresh token NOT rotated (same as before)", stored_refresh == web_refresh)

# --- A6: Verify refreshed token works + stored userinfo updated ---
print("\n--- A6: Verify refreshed access token + userinfo ---")
verify_userinfo(new_web_access, "web refreshed: ")

# Verify userinfo.json was updated by the refresh
verify_stored_userinfo("web post-refresh: ")

# Also verify via CLI → auth token now returns the new one
r = cli("auth", "token")
check("CLI token now returns refreshed token", r.stdout.strip() == new_web_access)

# --- A7: Hub client with OAuth2 token ---
print("\n--- A7: Hub(oauth_token=...) ---")
from cocalc_api import Hub

try:
    hub = Hub(oauth_token=new_web_access, host=HOST)
    result = hub.system.ping()
    check("Hub.system.ping() works with web oauth_token", result is not None)
except Exception as e:
    check("Hub.system.ping() works with web oauth_token", False, str(e))

# --- A8: CLI logout ---
print("\n--- A8: CLI — auth logout ---")
r = cli("auth", "logout")
check("CLI 'auth logout' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")

r = cli("auth", "token")
check("CLI 'auth token' fails after logout", r.returncode != 0)

r = cli("auth", "whoami")
check("CLI 'auth whoami' fails after logout", r.returncode != 0)

from cocalc_api.auth import _userinfo_file

check("userinfo.json deleted on logout", not _userinfo_file().exists())

# Brief pause to avoid rate limiter between parts
time.sleep(1)

# =========================================================================
# PART B: Native (public) client with PKCE
# =========================================================================

print("\n" + "=" * 60)
print("PART B: Native client with PKCE")
print("=" * 60)

# --- B1: Create client ---
print("\n--- B1: Create native client ---")
native_redirect_uri = "http://127.0.0.1:19877/callback"
native_client_id, native_client_secret, _ = create_client(cur, "native", native_redirect_uri)
all_client_ids.append(native_client_id)
print(f"  Created: {native_client_id}")

# --- B2: Insert auth code with PKCE and exchange ---
print("\n--- B2: Code exchange (PKCE S256) ---")
code_verifier = secrets.token_urlsafe(64)
code_challenge = sha256_b64url(code_verifier)

native_code = insert_auth_code(cur, native_client_id, native_redirect_uri, code_challenge=code_challenge, code_challenge_method="S256")

resp = httpx.post(
    f"{HOST}/auth/oauth/token",
    data={
        "grant_type": "authorization_code",
        "code": native_code,
        "client_id": native_client_id,
        "redirect_uri": native_redirect_uri,
        "code_verifier": code_verifier,
    },
    timeout=30.0,
)
check("PKCE code exchange returns 200", resp.status_code == 200, f"got {resp.status_code}: {resp.text}")

native_tokens = resp.json()
check("PKCE access_token present", "access_token" in native_tokens)
check("PKCE refresh_token present", "refresh_token" in native_tokens)

native_access = native_tokens.get("access_token", "")
native_refresh = native_tokens.get("refresh_token", "")

# --- B3: Wrong PKCE verifier rejected ---
print("\n--- B3: Wrong PKCE verifier → rejected ---")
bad_code = insert_auth_code(cur, native_client_id, native_redirect_uri, code_challenge=code_challenge, code_challenge_method="S256")

resp = httpx.post(
    f"{HOST}/auth/oauth/token",
    data={
        "grant_type": "authorization_code",
        "code": bad_code,
        "client_id": native_client_id,
        "redirect_uri": native_redirect_uri,
        "code_verifier": "this-is-wrong",
    },
    timeout=30.0,
)
check("wrong PKCE verifier rejected (400)", resp.status_code == 400, f"got {resp.status_code}")

# --- B4: Verify userinfo ---
print("\n--- B4: Verify access token (userinfo) ---")
verify_userinfo(native_access, "native: ")

# --- B5: CLI setup and basic commands ---
print("\n--- B5: CLI — status, token, whoami ---")
# Native mode: no client_secret stored
setup_stored_auth(native_access, native_refresh, native_client_id, "native")

# Verify userinfo was stored locally
verify_stored_userinfo("native setup: ")

r = cli("auth", "status")
check("CLI 'auth status' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")
check("CLI status shows 'native'", "native" in r.stdout, r.stdout)
check("CLI status shows user info", ACCOUNT_ID in r.stdout or "email" in r.stdout.lower(), r.stdout)

# Test whoami CLI
r = cli("auth", "whoami")
check("CLI 'auth whoami' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")
check("CLI whoami has sub", ACCOUNT_ID in r.stdout, r.stdout)

r = cli("auth", "token")
check("CLI 'auth token' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")
check("CLI token matches stored token", r.stdout.strip() == native_access)

# --- B6: CLI refresh (native → rotation expected) ---
time.sleep(1)  # avoid rate limiter
print("\n--- B6: CLI — auth refresh (rotation expected) ---")
r = cli("auth", "refresh")
check("CLI 'auth refresh' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")
check("CLI refresh says 'rotated'", "rotated" in r.stdout.lower() or "Rotated" in r.stdout, r.stdout)

refresh_output_lines = r.stdout.strip().split("\n")
new_native_access = refresh_output_lines[-1].strip()
check("new access token differs from old", new_native_access != native_access, f"old={native_access[:20]}... new={new_native_access[:20]}...")

# Verify the refresh token WAS rotated (native mode)
stored_refresh = _load_refresh_token(HOST)
check("refresh token WAS rotated (different)", stored_refresh != native_refresh,
      f"old={native_refresh[:20]}... new={stored_refresh[:20] if stored_refresh else 'None'}...")

# --- B7: Verify refreshed/rotated token works + stored userinfo updated ---
print("\n--- B7: Verify refreshed access token + userinfo ---")
verify_userinfo(new_native_access, "native refreshed: ")

# Verify userinfo.json was updated by the refresh
verify_stored_userinfo("native post-refresh: ")

r = cli("auth", "token")
check("CLI token now returns refreshed token", r.stdout.strip() == new_native_access)

# --- B8: Hub client with OAuth2 token ---
print("\n--- B8: Hub(oauth_token=...) ---")
try:
    hub = Hub(oauth_token=new_native_access, host=HOST)
    result = hub.system.ping()
    check("Hub.system.ping() works with native oauth_token", result is not None)
except Exception as e:
    check("Hub.system.ping() works with native oauth_token", False, str(e))

# --- B9: CLI logout ---
print("\n--- B9: CLI — auth logout ---")
r = cli("auth", "logout")
check("CLI 'auth logout' exits 0", r.returncode == 0, f"rc={r.returncode}: {r.stderr}")

r = cli("auth", "token")
check("CLI 'auth token' fails after logout", r.returncode != 0)

check("userinfo.json deleted on logout", not _userinfo_file().exists())

# =========================================================================
# PART C: Error cases and OAuth2 server metadata discovery
# =========================================================================

time.sleep(1)  # avoid rate limiter

print("\n" + "=" * 60)
print("PART C: Error cases and OAuth2 metadata discovery")
print("=" * 60)

# --- C1: Token revocation ---
print("\n--- C1: Token revocation ---")
# Re-issue a token for revocation test
revoke_code = insert_auth_code(cur, web_client_id, web_redirect_uri)
resp = httpx.post(
    f"{HOST}/auth/oauth/token",
    data={
        "grant_type": "authorization_code",
        "code": revoke_code,
        "client_id": web_client_id,
        "client_secret": web_client_secret,
        "redirect_uri": web_redirect_uri,
    },
    timeout=30.0,
)
check("get token for revocation test", resp.status_code == 200)
revoke_token = resp.json().get("access_token", "")

resp = httpx.post(f"{HOST}/auth/oauth/revoke", data={"token": revoke_token, "client_id": web_client_id}, timeout=30.0)
check("revoke returns 200", resp.status_code == 200)

resp = httpx.get(f"{HOST}/auth/oauth/userinfo", headers={"Authorization": f"Bearer {revoke_token}"}, timeout=30.0)
check("revoked token rejected (401)", resp.status_code == 401, f"got {resp.status_code}")

# --- C2: Invalid/expired code ---
print("\n--- C2: Invalid authorization code ---")
resp = httpx.post(
    f"{HOST}/auth/oauth/token",
    data={
        "grant_type": "authorization_code",
        "code": "nonexistent-code",
        "client_id": web_client_id,
        "client_secret": web_client_secret,
        "redirect_uri": web_redirect_uri,
    },
    timeout=30.0,
)
check("invalid code rejected (400)", resp.status_code == 400, f"got {resp.status_code}")

# --- C3: Missing client_secret AND no PKCE → rejected ---
print("\n--- C3: No secret and no PKCE → rejected ---")
bare_code = insert_auth_code(cur, web_client_id, web_redirect_uri)
resp = httpx.post(
    f"{HOST}/auth/oauth/token",
    data={
        "grant_type": "authorization_code",
        "code": bare_code,
        "client_id": web_client_id,
        "redirect_uri": web_redirect_uri,
    },
    timeout=30.0,
)
check("no auth method → rejected (401)", resp.status_code == 401, f"got {resp.status_code}")

# --- C4: OAuth2 server metadata discovery (RFC 8414) ---
print("\n--- C4: OAuth2 server metadata discovery ---")
resp = httpx.get(f"{HOST}/auth/.well-known/oauth-authorization-server", timeout=10.0)
check("RFC 8414 metadata returns 200", resp.status_code == 200, f"got {resp.status_code}")

if resp.status_code == 200:
    meta = resp.json()
    check("metadata has authorization_endpoint", "authorization_endpoint" in meta)
    check("metadata has token_endpoint", "token_endpoint" in meta)
    check("metadata has userinfo_endpoint", "userinfo_endpoint" in meta)
    check("metadata supports authorization_code grant", "authorization_code" in meta.get("grant_types_supported", []))
    check("metadata supports refresh_token grant", "refresh_token" in meta.get("grant_types_supported", []))
    check("metadata supports S256 PKCE", "S256" in meta.get("code_challenge_methods_supported", []))
    check("metadata only supports S256 (no plain)",
          meta.get("code_challenge_methods_supported") == ["S256"],
          f"got {meta.get('code_challenge_methods_supported')}")
    check("metadata does NOT have id_token_signing_alg_values_supported",
          "id_token_signing_alg_values_supported" not in meta)

# =========================================================================
# Cleanup
# =========================================================================

print("\n=== Cleanup ===")

for cid in all_client_ids:
    cur.execute("DELETE FROM oauth2_access_tokens WHERE client_id = %s", [cid])
    cur.execute("DELETE FROM oauth2_refresh_tokens WHERE client_id = %s", [cid])
    cur.execute("DELETE FROM oauth2_authorization_codes WHERE client_id = %s", [cid])
    cur.execute("DELETE FROM oauth2_clients WHERE client_id = %s", [cid])
print(f"  Cleaned up {len(all_client_ids)} test OAuth2 clients and their tokens")

cur.close()
conn.close()

# Clean up any leftover auth file
from cocalc_api.auth import _auth_file

f = _auth_file()
if f.exists():
    f.unlink()

# =========================================================================
# Summary
# =========================================================================

print(f"\n{'=' * 60}")
print(f"OAuth2 E2E Tests: {passed} passed, {failed} failed")
print(f"{'=' * 60}")

sys.exit(1 if failed > 0 else 0)
