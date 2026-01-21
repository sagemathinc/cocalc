# CoCalc Launchpad - Minimal On-Prem Quick Start (Draft)

This is a quick-start for the minimal on-prem mode. It favors max simplicity
over scale. This mode is intended for small teams (3-10 users) and a small
number of hosts.

Status: draft / in development.

## Choose a Mode

Launchpad supports two deployment modes (explicitly selected by an admin):

- **On\-prem \(local only\)**: all traffic is local, no Cloudflare tunnels, and
  backups use a local repo over SFTP. This document describes this mode.
- **Cloud \(global\)**: traffic goes through Cloudflare and backups use cloud
  buckets. This mode is configured by providing Cloudflare \+ bucket settings
  \(separate doc forthcoming\).

Mode selection is explicit:

- Default mode is **unset**: Launchpad starts, but does not start sshd/sshpiperd
  and does not activate host connectivity until an admin selects a mode.
- Admins choose a mode in Admin Settings (later this will be a first-run setup
  dialog).
- You may also set `COCALC_LAUNCHPAD_MODE=onprem|cloud` to preselect the mode in
  headless installs.

## Overview

- One hub process serves HTTPS + WebSocket and proxies host traffic.
- Hosts connect outbound to the hub and establish a reverse SSH tunnel.
- Backups use rustic over SFTP to a local repo directory on the hub.
- No wildcard DNS required; routing is path-based.

## Default Ports (Base Port Model)

Set one base port and everything else is derived:

- COCALC_BASE_PORT=8443
- COCALC_HTTPS_PORT=COCALC_BASE_PORT
- COCALC_HTTP_PORT=COCALC_BASE_PORT-1 (optional redirect only)
- COCALC_SSHD_PORT=COCALC_BASE_PORT+1 (host reverse tunnel + SFTP)
- COCALC_SSHPIPERD_PORT=COCALC_BASE_PORT+2 (end-user SSH)
- COCALC_DATA_DIR=~/.local/share/cocalc/launchpad

Explicit port overrides are supported, but not expected in the simplest setup.

## Example Env Block (Optional)

Launchpad works with **zero config**. The settings below are optional and only
needed if you want to override defaults.

```bash
# Optional overrides (defaults work if you omit all of this)
export COCALC_BASE_PORT=8443
export COCALC_DATA_DIR=~/.local/share/cocalc/launchpad
export COCALC_DISABLE_HTTP=true
```

## Quick Start

1. Optionally, pick a base port and data directory by setting environment variables.
   Example defaults:
   - COCALC\_BASE\_PORT=8443
   - COCALC\_DATA\_DIR=~/.local/share/cocalc/launchpad

2. Start the Launchpad hub.
   - Provide TLS cert and key.
   - Disable HTTP \(or keep it as redirect only\).

3. In Admin Settings, select **On‑prem** mode.
   - Hub starts a locked down sshd \+ sshpiperd as child processes.

4. Create a host join token using the hub UI/CLI.

5. On each host, run the connector with:
   - hub URL
   - join token
   - \(optional\) explicit port overrides

6. Confirm hosts appear in the hub UI and can start workspaces.

Launchpad prints a startup summary showing the resolved ports and data
directory so you can verify the defaults it selected.

## Networking Requirements

Host -> Hub (outbound only):

- HTTPS/WSS to hub port
- SSH to hub sshd port (reverse tunnel)

Users -> Hub:

- HTTPS/WSS to hub port
- SSH to sshpiperd port

## Backups (Rustic + SFTP)

- Single rustic repo stored on the hub:
  COCALC_DATA_DIR/backup-repo
- Hosts use SFTP to the hub sshd port.
- One repo for all projects; host tag identifies each project backup.

## When Hub and Host Are the Same Machine

If the host runs on the same machine as the hub, the reverse SSH tunnel
is skipped and the proxy connects directly to localhost.

## Notes

- On\-prem and cloud modes are exclusive. If you need both, run two hubs.
- Port changes require a hub restart.
- PGlite (embedded Postgres) stores data in COCALC\_DATA\_DIR

