# Self-Hosted Cloud Connector Design

## Summary

Provide a local "connector" daemon that manages VM lifecycle via a local
hypervisor (initially multipass) and connects outbound to the CoCalc hub
over a websocket. This removes the need for the user to run cloud-init
commands manually while keeping the local machine isolated and auditable.

## Goals

- Offer a first-class "self-hosted cloud" provider with good UX.
- Keep the connector narrow and auditable: VM lifecycle only.
- Support NAT/firewalled environments (outbound-only connectivity).
- Reuse existing bootstrap flow (token + cloud-init fetch).
- Make operations idempotent and resilient to reconnects.

## Non-Goals

- Arbitrary command execution on the local machine.
- Full host management or file system access outside the VM sandbox.
- Solving all network data-migration paths on day one.

## Architecture Overview

1) Hub issues a pairing token to the user.
2) Connector daemon runs locally and connects to the hub over websocket.
3) Hub sends commands (create/start/stop/delete/status) to the connector.
4) Connector executes the action via multipass and reports results.
5) VMs run cloud-init with a short-lived bootstrap token that fetches the
   full bootstrap script from the hub.

## Trust and Security Model

- Connector is open source and intentionally minimal; users can audit it.
- The daemon only accepts a small allowlist of commands.
- All VMs are named with a fixed prefix; connector refuses to touch other VMs.
- Connector stores a single token and only uses it for the websocket channel.
- No inbound ports required on the user machine.
- Local logs include every action and response payload for auditing.

## Pairing and Auth

- Hub UI provides a one-time pairing token (scoped to "connector" and user).
- Connector uses the token to register and receives a long-lived token.
- Websocket messages are authenticated via the long-lived token header.
- Token is revocable from the hub.

## Protocol (High Level)

Messages over websocket:

- `connector.hello` -> identify connector id, version, capabilities.
- `connector.heartbeat` -> keepalive + current local status.
- `vm.create` -> region, size, gpu flag, cloud-init script.
- `vm.start`, `vm.stop`, `vm.delete`.
- `vm.status` -> status, instance id, public IP (if any), errors.

## VM Lifecycle Flows

Create:

- Hub selects a host spec and generates a cloud-init script containing a
  short-lived bootstrap token.
- Connector runs `multipass launch` with the cloud-init user-data.
- Connector reports VM metadata (name, IP, state).

Start/Stop:

- Connector runs `multipass start` or `multipass stop`.
- Connector reports status transitions.

Delete:

- Connector runs `multipass delete` and `multipass purge` for the VM name
  prefix only.

## Bootstrap Flow (Reuse)

- Cloud-init is minimal: it downloads the bootstrap script from the hub and
  executes it, using the bootstrap token.
- Bootstrap token is hashed in the DB and expires after a short TTL.
- Bootstrap is idempotent and writes logs to `/root/bootstrap`.

## Networking Options (Host Access)

Primary: HTTPS via Cloudflare Tunnel

- Project hosts run cloudflared to expose HTTPS without public IP.
- Works for websocket-based project access.

Option A: reflect-sync port forwarding

- Use existing reflect\-sync program for TCP forwarding.
- Useful for SSH and direct host\-to\-host traffic.
- May require a rendezvous endpoint if both ends are behind NAT.
  - good point, and that isn't something it can do, actually.

Option B: Wireguard overlay

- Strong isolation and predictable routing.
- More bookkeeping and privileges required.

Fallback (no direct host-to-host traffic):

- Do not use btrfs send/receive between hosts.
- Use Rustic backups via R2 for migration and file transfer.
- Requires only outbound access to R2.

## Backend Options and Recommendations

- **Multipass (recommended MVP)**: easiest install on macOS + Linux, clean CLI,
  simple Ubuntu images, outbound NAT works, and straightforward automation.
  No GPU support.
- **libvirt/KVM (Linux only)**: best path to GPU passthrough; heavier setup.
  Good as an advanced backend for Linux power users.
- **LXD/Incus (Linux only)**: supports VMs/containers; GPU possible on Linux,
  but install and UX are more complex than multipass.
- **VirtualBox/VMware**: cross-platform, but heavy installs and licensing/driver
  friction make them a poor default.
- **Lima/Colima/Podman Machine**: viable on macOS, but not simpler than multipass
  and no clear GPU path.

GPU note:
- For GPU needs on self-hosted setups, the likely path is **run project-host
  directly on the GPU server** (no nested VM) or offer a Linux-only libvirt
  backend later.

## Host-to-Host SSH via Cloudflare Access

Goal: allow project-hosts to SSH/rsync/btrfs-send to each other without
maintaining our own VPN or jump nodes.

Plan:
- Use the existing cloudflared daemon on each host and add a second ingress
  hostname for SSH (e.g. `ssh-<host_id>.cocalc.ai` → `ssh://localhost:2222`).
- Enable Cloudflare Access for the SSH hostname.
- Use Access service tokens on project-hosts so the SSH client can authenticate
  non-interactively.
- Configure ProxyCommand so rsync/btrfs send/recv use cloudflared:
  `ssh -o ProxyCommand='cloudflared access ssh --hostname %h' ...`

Notes:
- This is TCP over Access (not raw public SSH), so no inbound ports needed.
- Only project-hosts need the Access tokens; users do not.

## Operational Idempotency

- All lifecycle operations should be safe to repeat.
- Deletes should treat "not found" as success.
- Connector should recover from hub disconnects and resume.

## Open Questions

- Where to host the connector websocket endpoint \(hub vs dedicated service\)?
- How to encode capabilities \(GPU support, local storage limits\)?
  - multipass has no GPU support.  https://github.com/canonical/multipass/issues/2503 
- Whether to allow optional local bridging to expose VM IPs directly.
- How to map pricing and quotas for self\-hosted resources.
  - no pricing and quotas, but only members are allowed to start projects on these resources; basically, we'll get by membership.

## Implementation Plan

1) **Connector MVP**
   - Implement a small Node.js daemon that connects to the hub via websocket.
   - Add pairing flow (one-time token → long-lived connector token).
   - Enforce strict VM name prefix and action allowlist.
   - Support create/start/stop/delete/status for multipass.
2) **Hub API + UI**
   - Add connector management UI (pair, revoke, view status).
   - Add websocket endpoint + basic message routing.
   - Store connector tokens + metadata (host machine, capabilities).
3) **VM Lifecycle Integration**
   - Treat connector as a provider in the project-host flow.
   - Inject minimal cloud-init script at create time.
   - Track status updates from connector for host lifecycle.
4) **Networking Strategy**
   - Default to Cloudflare Tunnel for HTTPS.
   - Optional reflect-sync forwarding for SSH / direct host-to-host traffic.
   - Provide fallback “R2-only migration” flow when no direct connectivity.
5) **Hardening + Observability**
   - Add structured logs + local audit log for daemon actions.
   - Add rate limits and reconnect backoff.
   - Document security posture and user responsibilities.
6) **Beta Rollout**
   - Publish connector as standalone installable package.
   - Collect feedback from self-hosted users.
   - Iterate on auth + UX.
