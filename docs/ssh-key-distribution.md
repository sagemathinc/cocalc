# SSH Keys for Project SSH (sshpiperd)

This document describes the **sshpiperd host key** used for inbound user SSH to projects. There is no host-to-host SSH key distribution for project moves or file copies; those paths use rustic backups.

## Key type

- **sshpiperd key**: The per-host SSH key used by sshpiperd to terminate inbound SSH. Stored in the project-host sqlite DB as `sshpiperd_public_key` / `sshpiperd_private_key`.

## Where the key lives

- Local persistence: [src/packages/project-host/sqlite/hosts.ts](./src/packages/project-host/sqlite/hosts.ts) stores the keypair so restarts reuse the same key.
- Secrets on disk: the private key is written to `${SECRETS}/sshpiperd/host_key` before sshpiperd starts.

## How the key is generated

- On project-host startup, `ensureSshpiperdKey` (see [src/packages/project-host/ssh/sshpiperd-key.ts](./src/packages/project-host/ssh/sshpiperd-key.ts)) generates the keypair if missing and persists it.
- sshpiperd is launched from [src/packages/project-host/file-server.ts](./src/packages/project-host/file-server.ts) with `hostKeyPath` pointing to the injected private key, so it never self-generates.

## How the key is published

- The project-host registers with the control hub (`project-hosts.api`) from [src/packages/project-host/master.ts](./src/packages/project-host/master.ts), sending `sshpiperd_public_key`.
- The control hub stores the key in Postgres and may broadcast it on `project-hosts.keys` (see [src/packages/server/conat/host-registry.ts](./src/packages/server/conat/host-registry.ts)).

## How the key is used

- **Inbound SSH (users → projects)**: sshpiperd presents the host key and forwards authenticated SSH to the project container. Authorization is decided by the sshpiperd auth plugin (see [src/packages/project-proxy/auth.ts](./src/packages/project-proxy/auth.ts)) using authorized keys gathered from the master and project filesystem.
- **Known-hosts pinning (optional)**: clients can pin to the published `sshpiperd_public_key` to prevent MITM.

## Rotation

- Keys persist in sqlite and are reused across restarts.
- To rotate: delete/replace the stored key in sqlite (and the on-disk sshpiperd key), then restart the host; it will re-register the new public key.

```mermaid
flowchart TD
  subgraph Host[Project Host]
    PK[Ensure sshpiperd key]
    WK[Write private key to secrets]
    SP[Start sshpiperd with injected key]
  end

  subgraph Hub[Control Hub]
    REG[(Register host)]
    DB[(Postgres project_hosts)]
    PUB[Publish sshpiperd public key]
  end

  PK --> REG
  REG --> DB
  DB --> PUB
  WK --> SP
