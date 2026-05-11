"""
CLI for cocalc-api — OAuth2 authentication and CoCalc API access.

Usage:
    cocalc-api auth login  --host URL --client-id ID [--client-secret SECRET]
    cocalc-api auth status | logout | token | refresh | whoami

    cocalc-api hub system ping
    cocalc-api hub projects get [--all] [--deleted] [--hidden]
    cocalc-api hub jupyter execute --input "1+1" --kernel python3
    cocalc-api hub messages send --subject "Hi" --body "..." --to-ids UUID

    cocalc-api project exec --command "ls" [--project-id UUID]
    cocalc-api org get-all

    cocalc-api run --project-id UUID "command"
"""

import json as _json
import sys

import click

from . import auth


@click.group()
@click.option("--api-key", envvar="COCALC_API_KEY", default=None, help="CoCalc API key")
@click.option("--host", envvar="COCALC_HOST", default=None, help="CoCalc host URL")
@click.option("--oauth-token", default=None, help="OAuth2 access token")
@click.option("--project-id", envvar="COCALC_PROJECT_ID", default=None, help="Project UUID (for project commands)")
@click.pass_context
def main(ctx, api_key, host, oauth_token, project_id):
    """CoCalc API client — authenticate and interact with CoCalc programmatically."""
    ctx.ensure_object(dict)
    ctx.obj["api_key"] = api_key
    ctx.obj["host"] = host
    ctx.obj["oauth_token"] = oauth_token
    ctx.obj["project_id"] = project_id


# ─────────────────────────────────────────────
# auth (handcrafted — special OAuth2 flow logic)
# ─────────────────────────────────────────────

@main.group()
def auth_cmd():
    """OAuth2 authentication."""
    pass


# Register as "auth" instead of "auth-cmd"
main.add_command(auth_cmd, "auth")


@auth_cmd.command()
@click.option("--host", required=True, help="CoCalc instance URL (e.g. https://cocalc.com)")
@click.option("--client-id", required=True, help="OAuth2 client ID")
@click.option("--client-secret", default=None, help="Client secret (confidential mode). Omit for native/PKCE.")
@click.option("--scopes", default="openid profile email api:read api:project", help="Space-separated scopes")
@click.option("--port", default=0, type=int, help="Local port for native callback (0 = auto)")
def login(host, client_id, client_secret, scopes, port):
    """Authenticate via OAuth2 (opens browser for native mode)."""
    try:
        tokens = auth.login(
            host=host,
            client_id=client_id,
            client_secret=client_secret,
            scopes=scopes,
            port=port,
        )
        click.echo(f"\nAuthentication successful!")
        click.echo(f"Access token expires in {tokens.get('expires_in', '?')}s")
        click.echo(f"Stored in: {auth._auth_file()}")
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@auth_cmd.command()
def status():
    """Show current auth status (verifies token with server)."""
    auth.status()


@auth_cmd.command()
def logout():
    """Clear stored tokens and revoke access."""
    auth.logout()


@auth_cmd.command()
def token():
    """Print current access token (refreshes if expired)."""
    t = auth.get_token()
    if t:
        click.echo(t)
    else:
        click.echo("No valid token. Run: cocalc-api auth login ...", err=True)
        sys.exit(1)


@auth_cmd.command()
def refresh():
    """Force a token refresh and show rotation status."""
    try:
        result = auth.refresh()
        click.echo(f"Access token refreshed (expires in {result['expires_in']}s)")
        if result["rotated"]:
            click.echo("Refresh token rotated (new token issued)")
        else:
            click.echo("Refresh token reused (confidential client)")
        click.echo(result["new_access_token"])
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@auth_cmd.command()
def whoami():
    """Show authenticated user info (fetches from server)."""
    info = auth.whoami()
    if info:
        click.echo(_json.dumps(info, indent=2))
    else:
        click.echo("Not authenticated.", err=True)
        sys.exit(1)


# ─────────────────────────────────────────────
# run (handcrafted — direct project exec)
# ─────────────────────────────────────────────

@main.command()
@click.option("--project-id", required=True, help="Project UUID")
@click.option("--timeout", default=60, type=int, help="Timeout in seconds (default: 60)")
@click.argument("command")
@click.pass_context
def run(ctx, project_id, timeout, command):
    """Run a shell command in a remote CoCalc project.

    The command is executed in the project's sandboxed environment via the API.
    """
    import httpx

    # Prefer global options from context, fall back to stored auth
    global_host = ctx.obj.get("host")
    global_oauth_token = ctx.obj.get("oauth_token")
    global_api_key = ctx.obj.get("api_key")

    DEFAULT_HOST = "https://cocalc.com"
    if global_oauth_token:
        access_token = global_oauth_token
        host = global_host or auth._load_auth().get("host", "") or DEFAULT_HOST
    elif global_api_key:
        access_token = global_api_key
        host = global_host or auth._load_auth().get("host", "") or DEFAULT_HOST
    else:
        data = auth._load_auth()
        host = global_host or data.get("host", "") or DEFAULT_HOST
        access_token = auth.get_token()

    if not host or not access_token:
        click.echo("Not authenticated. Run: cocalc-api auth login ...", err=True)
        sys.exit(1)

    # Determine auth header style: API keys use Basic auth, tokens use Bearer
    if global_api_key:
        auth_header = httpx.BasicAuth(global_api_key, "")
    else:
        auth_header = None

    try:
        # Call /api/conat/project directly (project exec uses this endpoint)
        headers = {"Content-Type": "application/json"}
        if not global_api_key:
            headers["Authorization"] = f"Bearer {access_token}"
        resp = httpx.post(
            f"{host}/api/conat/project",
            json={
                "project_id": project_id,
                "name": "system.exec",
                "args": [{"command": "bash", "args": ["-c", command], "timeout": timeout}],
            },
            headers=headers,
            auth=auth_header,
            timeout=float(timeout + 30),
        )
        resp.raise_for_status()
        result = resp.json()
        if isinstance(result, dict) and "error" in result:
            click.echo(f"Error: {result['error']}", err=True)
            sys.exit(1)
        if isinstance(result, dict):
            stdout = result.get("stdout", "")
            stderr = result.get("stderr", "")
            exit_code = result.get("exit_code", 0)
            if stdout:
                click.echo(stdout, nl=False)
            if stderr:
                click.echo(stderr, nl=False, err=True)
            sys.exit(exit_code)
        else:
            click.echo(result)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


# ─────────────────────────────────────────────
# Dynamic groups: hub, project, org
# Generated from API wrapper class signatures
# ─────────────────────────────────────────────

from .cli_gen import build_hub_group, build_org_group, build_project_group

main.add_command(build_hub_group(), "hub")
main.add_command(build_project_group(), "project")
main.add_command(build_org_group(), "org")


if __name__ == "__main__":
    main()
