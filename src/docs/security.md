# Security Model & Deployment Isolation

> **Maintenance note**: Update this file when the container/isolation model,
> authentication flow, or trust boundaries change.

## Project Isolation

Every CoCalc project runs inside its own **container** (Docker or Kubernetes
pod). The container boundary is the primary security perimeter for project
code execution.

### What the container provides

- **Filesystem isolation**: The container's root filesystem is **read-only**
  except for the project's home directory, which is bind-mounted as the only
  writable volume. No other project's home directory is mounted or reachable
  from inside the container.
- **Process isolation**: The project daemon and any user-spawned processes
  (shells, Jupyter kernels, etc.) are confined to the container. They cannot
  see or signal processes belonging to other projects.
- **Network isolation**: Containers are on an internal network and can only
  reach the hub/conat layer, not other project containers directly.
- **User isolation**: Each container runs as an unprivileged user. There is
  no shared OS-level user between projects.

### Consequence for path traversal

Because every path outside the project home directory is on a read-only
filesystem layer, a `../`-based path traversal in a file write operation
(e.g. the upload endpoint) will fail with a filesystem permission error at
the OS level, even before any application-layer check fires. There is no
path from Project A's container to Project B's home directory.

The application-layer traversal checks added in `upload.ts` and
`project/conat/files/write.ts` are therefore defense-in-depth: they produce
a clear error message earlier, but the container boundary is the hard
enforcement.

## Hub Trust Boundary

The hub process runs **outside** all project containers. It is the only
component that talks to PostgreSQL and is responsible for all cross-project
authentication and authorization checks (collaborator membership, API key
validation, etc.). The hub never mounts or directly reads project home
directories.

## Authentication Layers

| Layer                   | Mechanism                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Browser ↔ Hub           | Session cookie (`remember_me`) or API key, checked on every proxied request        |
| Hub → Project proxy     | `hasAccess()` verifies write-access to project before upgrading WebSocket          |
| Project WebSocket API   | Trusted only after hub proxy authentication; no additional auth inside             |
| REST API (`/api/v2/*`)  | Cookie or API key via `getAccount(req)` on every endpoint handler                  |
| Compute server check-in | Project-scoped API key; DB query enforces `project_id` matches `compute_server_id` |

## What Authenticated Users Can Do Inside Their Project

A collaborator who has passed the hub's access check can:

- Execute arbitrary shell commands and code (this is the product's core feature)
- Read and write any file inside the project's home directory
- Call `eval_code` via the project WebSocket to run arbitrary JavaScript in
  the project daemon's Node.js process

All of the above is **intentional**. CoCalc is a compute environment; users
are expected to run arbitrary code. The security goal is containment: that
code stays inside the project's container and cannot affect other projects or
the host.

## Blobs Endpoint

`GET /blobs/:uuid` serves binary blobs (mainly images embedded in markdown)
without requiring authentication. This is intentional: blobs are addressed by
content-derived UUIDs (SHA-1 of the file content), are set with
`Cache-Control: public`, and are designed to be embeddable in shared
documents. Users should not upload sensitive files via the blob mechanism if
they require access control; those files should be stored in the project
filesystem instead.
