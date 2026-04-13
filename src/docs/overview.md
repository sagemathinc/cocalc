# CoCalc Architecture Overview

> **Maintenance note**: Update this file when packages are added/removed or
> when the high-level architecture changes.

## System Components

CoCalc is a TypeScript/JavaScript SaaS monorepo. The major runtime components
are:

```
Browser (React)  ──WebSocket──▶  Hub (Node.js)  ──Conat──▶  Project (Node.js)
       │                              │
       │                              ▼
       │                        PostgreSQL DB
       │
       ▼
  Next.js (SSR + API routes)
```

### Component Roles

| Component | Package(s)                              | Role                                             |
| --------- | --------------------------------------- | ------------------------------------------------ |
| Frontend  | `packages/frontend`, `packages/static`  | React SPA with Redux-style stores                |
| Hub       | `packages/hub`, `packages/server`       | Central server, API dispatch, DB access          |
| Next.js   | `packages/next`                         | SSR pages, REST API routes, conat bridge         |
| Conat     | `packages/conat`                        | Messaging layer (pub/sub, DKV, request/response) |
| Project   | `packages/project`                      | Per-user project daemon (exec, jupyter, files)   |
| Database  | `packages/database`                     | PostgreSQL schema and query layer                |
| Sync      | `packages/sync`, `packages/sync-client` | Real-time collaborative editing (OT/CRDT)        |
| Util      | `packages/util`                         | Shared types, utilities, DB schema definitions   |
| Comm      | `packages/comm`                         | WebSocket message type definitions               |

### Data Flow

1. **User action in browser** → frontend dispatches to Redux store and/or
   calls `webapp_client` methods
2. **Frontend → Hub**: via conat over WebSocket (`hub.account.{account_id}.api`)
3. **Hub → Database**: via `getPool()` from `@cocalc/database/pool`
4. **Hub → Project**: via conat subjects (`project.{project_id}.*.api`)
5. **External API → Hub**: HTTP POST to Next.js `/api/conat/hub` → conat bridge
6. **Real-time sync**: via conat pub/sub and DKV for collaborative editing

### Package Dependency Direction

```
util  ←  comm  ←  conat  ←  frontend
                    ↑          ↑
                  server  ←   hub
                    ↑
                  project
                    ↑
                  database
```

Shared code flows from `util` outward. The `conat` package is used by
frontend, hub/server, and project — it is the central communication layer.
