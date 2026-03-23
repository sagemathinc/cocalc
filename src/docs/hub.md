# Hub & Server Architecture

> **Maintenance note**: Update this file when hub startup, running modes,
> API dispatch, project control, or server-side service patterns change.

Hub package: `packages/hub`
Server package: `packages/server`

## Hub Role

The hub is the central coordinator of CoCalc. It:

- Listens for conat messages from frontends and projects
- Dispatches API calls to server-side implementations
- Manages the PostgreSQL database connection
- Handles authentication and authorization
- Coordinates project start/stop
- Runs migrations at startup
- Serves as HTTP/WebSocket proxy to projects

### Entry Point

`packages/hub/hub.ts` — Main hub startup

### Running Modes

The hub supports different deployment modes:

```
--mode [single-user|multi-user|kucalc|kubernetes]  (REQUIRED)
```

It can run as a monolith or as separate services:

| Flag              | Service                                       |
| ----------------- | --------------------------------------------- |
| `--all`           | Run all servers (socket, proxy, next, schema) |
| `--conat-server`  | Single integrated conat server                |
| `--conat-router`  | Core WebSocket server only                    |
| `--conat-api`     | API services (can run multiple instances)     |
| `--conat-persist` | Stream persistence (can run multiple)         |
| `--proxy-server`  | HTTP proxy to projects                        |
| `--next-server`   | Next.js landing/share pages                   |

### Startup Sequence

1. **Database connection** — connects to PostgreSQL, retries until successful
2. **Configuration loading** — server settings from environment variables
3. **Service initialization** — messaging, project control, conat API,
   persistence, health checks, maintenance loops
4. **HTTP server setup** — Express app with routing, proxy, and Next.js

## API Dispatch

When a frontend calls `hub.projects.createProject()`:

1. Conat message arrives at subject `hub.account.{account_id}.api`
2. Hub API server (listening on `hub.*.*.api` with queue group `"0"`) receives
3. Dispatcher splits `name` (e.g., `"projects.start"` → group=`projects`,
   function=`start`)
4. Auth wrapper validates (e.g., `authFirstRequireAccount`)
5. Implementation in `packages/server/conat/api/projects.ts` executes
6. Response flows back via `mesg.respond()`

Multiple API server instances can run — requests are load-balanced via
queue groups.

### Server API Implementations

`packages/server/conat/api/` contains the actual business logic:

| File                            | Implements                                           |
| ------------------------------- | ---------------------------------------------------- |
| `server/conat/api/projects.ts`  | Project CRUD, start/stop, collaborators, copy paths  |
| `server/conat/api/db.ts`        | Database touch, time-travel info, blobs, user query  |
| `server/conat/api/purchases.ts` | Payment and subscription logic                       |
| `server/conat/api/jupyter.ts`   | Jupyter kernel management                            |
| `server/conat/api/system.ts`    | Auth, user search, customization, API key management |
| `server/conat/api/messages.ts`  | User messaging                                       |
| `server/conat/api/org.ts`       | Organization management                              |
| `server/conat/api/sync.ts`      | Collaborative editing coordination                   |

### Server Package Structure

`packages/server/` is large and contains domain-specific implementations:

```
packages/server/
├── conat/
│   ├── api/             ← Conat API implementations (called by hub)
│   ├── socketio/        ← Socket.IO server, auth, DNS scanning
│   └── configuration.ts ← Load conat config from database
├── projects/
│   ├── control/         ← Project lifecycle (mode-specific)
│   └── connection/      ← Project socket connections
├── accounts/            ← Account management
├── auth/                ← Authentication (passports, SSO, tokens)
├── api/                 ← Hub/project bridge implementations
├── purchases/           ← Billing and purchases
├── stripe/              ← Stripe integration
├── licenses/            ← License management
├── llm/                 ← LLM/AI integration
├── jupyter/             ← Jupyter operations
├── database/            ← Database queries & user tracking
└── ...                  ← Email, metrics, news, support, etc.
```

## Conat Socket.IO Server

Location: `packages/server/conat/socketio/`

The conat transport layer uses Socket.IO (WebSocket mode):

- `socketio/server.ts` — Server initialization, clustering support
- `socketio/auth.ts` — Cookie-based authentication
- `socketio/dns-scan.ts` — Kubernetes DNS scanning for cluster discovery

### Authentication Methods

The Socket.IO auth layer (`auth.ts`) supports multiple cookie types:

| Cookie                  | Purpose                       |
| ----------------------- | ----------------------------- |
| `HUB_PASSWORD_COOKIE`   | System hub password           |
| `API_COOKIE`            | API key (account or project)  |
| `PROJECT_SECRET_COOKIE` | Project secret token          |
| `REMEMBER_ME_COOKIE`    | User remember-me session hash |

Auth resolves to `{ account_id }`, `{ project_id }`, or `{ hub_id }`.

## Database Access

The hub and server access PostgreSQL via:

```typescript
import { getPool } from "@cocalc/database/pool";

const pool = getPool();
const { rows } = await pool.query(
  "SELECT * FROM accounts WHERE account_id = $1",
  [accountId],
);
```

### Database Package

`packages/database/` provides:

- `database/pool.ts` — Connection pool management
- `database/postgres/` — Query abstractions and helpers
- `database/conat/changefeed-api.ts` — Real-time database subscriptions
- Schema defined in `packages/util/db-schema/`

## Hub Migrations

Migration functions in the hub:

- Run once at startup
- Use batch processing with delays between batches
- Avoid saturating the database
- Located in `packages/hub/` (e.g., `migrate-bookmarks.ts`)

## Project Management

The hub manages project lifecycles through a mode-specific control system.

### Project Control Modes

Location: `packages/server/projects/control/`

| Mode          | Description                              |
| ------------- | ---------------------------------------- |
| `single-user` | Direct file system access (dev/personal) |
| `multi-user`  | TCP connections to local project servers |
| `kucalc`      | gRPC to compute servers                  |
| `kubernetes`  | Kubernetes API integration               |

### BaseProject Interface

`packages/server/projects/control/base.ts` defines the abstract interface:

```typescript
abstract class BaseProject extends EventEmitter {
  project_id: string;

  async start(): Promise<void>;
  async stop(): Promise<void>;
  async restart(): Promise<void>;
  async state(): Promise<ProjectState>;
  async status(): Promise<ProjectStatus>;
  async copyPath(opts: CopyOptions): Promise<void>;
  async setAllQuotas(): Promise<void>;
  async touch(account_id?, opts?): Promise<void>;
}
```

### Communication

Projects communicate via conat subjects `project.{project_id}.*`.
The actual project daemon runs in `packages/project/` (see
[project.md](project.md)).

## HTTP Proxy

Location: `packages/hub/proxy/`

The hub proxies HTTP and WebSocket requests to running projects:

- `proxy/index.ts` — Route matching (`/:project_id/*`)
- `proxy/proxy-conat.ts` — WebSocket proxy to conat servers (cluster mode)
- Access checks verify collaborator status via cookies/API keys

### Express Middleware Stack

`packages/hub/servers/express-app.ts` sets up the middleware in order:

1. Health checks
2. Metrics endpoint
3. Virtual hosts (share)
4. Cookie parsing
5. Instrumentation (Prometheus)
6. Static assets (`/static`, `/webapp`, `/cdn`)
7. Blob operations
8. File upload
9. Customization endpoint
10. Stats endpoint
11. **Proxy handler** (project routes)
12. **Next.js server** (catch-all)

## Authentication

- Frontend connections authenticate via conat Socket.IO cookies
- Each conat request includes the account_id extracted from the subject
- Hub verifies permissions before executing operations
- Auth wrappers: `authFirstRequireAccount`, `authFirst`, `noAuth`,
  `requireAccount` in `packages/conat/hub/api/util.ts`
- Authorization checks (e.g., `isCollaborator`) happen in service
  implementations
