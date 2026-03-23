# Conat Messaging System

> **Maintenance note**: Update this file when conat protocol, subjects, DKV,
> pub/sub patterns, or service framework changes.

Package: `packages/conat`

Conat is CoCalc's custom distributed messaging system, inspired by NATS. It
provides pub/sub, request/response, distributed key-value storage, TCP-like
sockets, and a service framework across all components (frontend, hub, project).

## Core Protocol

Location: `packages/conat/core/`

- `core/client.ts` — Main `Client` class (extends EventEmitter)
- `core/server.ts` — Server-side conat broker
- `core/types.ts` — Protocol type definitions
- `core/patterns.ts` — Subject pattern matching (NATS-style `*` and `>` wildcards)
- `core/constants.ts` — Protocol limits

### Features

- NATS-like pub/sub/request/response messaging
- Automatic message chunking for large payloads (no size limits)
- Multiple encoding formats: MsgPack (default, handles dates/buffers), JSON
- Delivery confirmation and interest-based messaging
- Hierarchical subject routing with wildcard patterns
- Subscriptions survive client/server disconnects and reconnects
- Socket.io transport (WebSocket mode)

### Protocol Limits

```
MAX_PAYLOAD: 8MB (automatic chunking for larger messages)
MAX_SUBSCRIPTIONS_PER_CLIENT: 500
MAX_SUBSCRIPTIONS_PER_HUB: 15,000
MAX_CONNECTIONS: 10,000
```

### Core Client Methods

```typescript
const client: Client = ...;

// Pub/sub
client.subscribe(subject);              // → AsyncIterator of messages
client.publish(subject, data);          // → recipient count

// Request/response
client.request(subject, data, opts);    // → single response
client.requestMany(subject, data);      // → streaming responses

// Distributed data structures
client.dkv(opts);                       // → DKV store
client.dko(opts);                       // → ordered DKV
client.dstream(opts);                   // → distributed stream

// TCP-like sockets
client.socket.listen(subject);          // → server
client.socket.connect(subject);         // → socket
```

## Subject Naming

Location: `packages/conat/names.ts`

Messages are routed via hierarchical subjects. Use `*` for single-level
wildcard and `>` for all remaining levels.

### Account-scoped

```
hub.account.{account_id}.api                           — Hub API calls
account.{account_id}.estream.>                         — Ephemeral streams
account.{account_id}.stream.>                          — Persistent streams
_INBOX.account-{account_id}.{random_id}                — Private response inbox
services.account-{account_id}.{browser_id}.{service}   — Account services
```

### Project-scoped

```
project.{project_id}.{compute_server_id}.api           — Project API calls
project.{project_id}.{compute_server_id}.stream.>      — Persistent streams
project.{project_id}.{compute_server_id}.pubsub-{name} — Ephemeral pub/sub
services.project-{project_id}.{compute_server_id}.{service}
```

### Hub-scoped

```
hub.account.{account_id}.api     — Frontend → Hub API requests
hub.project.{project_id}.api     — Project status/control
hub.*.*.api                      — Pattern for hub API servers to listen on
```

### Public

```
public.{service}                 — Public services (no auth)
_INBOX.public.{random_id}       — Public inbox
```

## DKV (Distributed Key-Value Store)

Location: `packages/conat/sync/dkv.ts`

An eventually consistent distributed key-value store for synchronized state
across browsers, projects, and hubs. Built on `CoreStream` (persistent
storage backend).

### Key Properties

- **Multimaster**: Any client can write; conflicts resolved via merge functions
- **Synchronous API**: get/set/delete are sync; background save is automatic
- **3-way merge**: Custom merge function `({key, local, remote, prev}) => resolved_value`
- **Default conflict strategy**: Last write wins (local value)
- **Change events**: `dkv.on('change', (key) => {...})`
- **Tombstone support**: Deleted keys use TTL-based cleanup

### Usage from Frontend

```typescript
import { webapp_client } from "@cocalc/frontend/webapp-client";

const dkv = await webapp_client.conat_client.dkv({
  account_id: "...",
  name: "my-store",
  merge: ({ local, remote }) => ({ ...remote, ...local }), // optional
});

dkv.set("key", value);
const val = dkv.get("key");
dkv.on("change", (key) => {
  /* react to changes */
});
dkv.close();
```

### Usage from Project

```typescript
import { dkv } from "@cocalc/conat/sync/dkv";

const store = await dkv({ project_id, name: "project-store" });
store.set("status", "running");
```

### Usage from Hub/Server

```typescript
import { dkv } from "@cocalc/conat/sync/dkv";

const store = await dkv({ name: "global-store" });
```

## PubSub

Location: `packages/conat/sync/pubsub.ts`

Ephemeral publish/subscribe for transient data (not persisted). Common uses:
cursor positions, active user presence, real-time indicators.

```typescript
// Broadcast
const pubsub = new PubSub({ project_id, name: "cursors" });
pubsub.set({ user_id: "...", position: 123 }); // broadcast to all

// Listen
pubsub.on("change", (data) => {
  /* handle update */
});
```

## Service Framework

Location: `packages/conat/service/`

Request/reply microservice pattern for long-running services:

```typescript
import { createConatService, callConatService } from "@cocalc/conat/service";

// Server side: register a service
const service = createConatService({
  account_id: "...",
  service: "custom-processor",
  handler: async (message) => {
    return { result: "..." };
  },
});

// Client side: call the service
const result = await callConatService({
  account_id: "...",
  service: "custom-processor",
  mesg: { task: "process-data" },
  timeout: 5000,
});
```

## Socket Abstraction

Location: `packages/conat/socket/`

TCP-like sockets emulated on top of pub/sub. Provides in-order, reliable,
lossless transmission with heartbeats, load balancing, and header support.

```typescript
// Server
const server = conat().socket.listen("my-service");
server.on("connection", (socket) => {
  socket.on("data", (data) => console.log(data));
  socket.write("response");
});

// Client
const socket = conat().socket.connect("my-service");
socket.write("request");
socket.on("data", (data) => console.log(data));
```

## Hub API Layer

Location: `packages/conat/hub/api/`

Defines typed API interfaces that map function calls to conat subjects.

### API Modules

| File                   | Service             | Methods                                             |
| ---------------------- | ------------------- | --------------------------------------------------- |
| `hub/api/projects.ts`  | Project management  | `createProject`, `start`, `stop`, `setQuotas`, etc. |
| `hub/api/db.ts`        | Database operations | Query, update, delete                               |
| `hub/api/purchases.ts` | Billing/purchases   | Payment processing, subscriptions                   |
| `hub/api/jupyter.ts`   | Jupyter operations  | Kernel management, execution                        |
| `hub/api/system.ts`    | System operations   | Health, version, stats                              |
| `hub/api/messages.ts`  | User messaging      | Send, receive, list                                 |
| `hub/api/org.ts`       | Organizations       | Org management                                      |
| `hub/api/sync.ts`      | Sync operations     | Collaborative editing sync                          |

### Registration Pattern

Each API module exports a map of method names to auth wrappers:

```typescript
// packages/conat/hub/api/projects.ts
import { authFirstRequireAccount } from "./util";

export const projects = {
  createProject: authFirstRequireAccount,
  start: authFirstRequireAccount,
  stop: authFirstRequireAccount,
  // ...
};
```

### Permission Levels

- `noAuth` — Public, no authentication needed
- `authFirst` — Requires sign-in if available, not mandatory
- `authFirstRequireAccount` — Requires signed-in user account
- `requireAccount` — Backend-only, must have account context

Implementations live in `packages/server/conat/api/` (see [hub.md](hub.md)).

## Project API Layer

Location: `packages/conat/project/api/`

Defines the API that projects expose via conat:

| File                    | Service    | Methods                                                                                                                                |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `project/api/system.ts` | System ops | `ping`, `exec`, `signal`, `jupyterExecute`, `listing`, `deleteFiles`, `moveFiles`, `readTextFileFromProject`, `writeTextFileToProject` |
| `project/api/editor.ts` | Editor ops | File editing operations                                                                                                                |
| `project/api/sync.ts`   | Sync ops   | Real-time sync coordination                                                                                                            |

## Other Sync Primitives

Location: `packages/conat/sync/`

| Primitive   | File                   | Purpose                                 |
| ----------- | ---------------------- | --------------------------------------- |
| DKV         | `sync/dkv.ts`          | Distributed key-value store             |
| DKO         | `sync/dko.ts`          | Distributed key-value with ordered keys |
| PubSub      | `sync/pubsub.ts`       | Publish/subscribe (ephemeral)           |
| AKV         | `sync/akv.ts`          | Append-only key-value                   |
| DStream     | `sync/dstream.ts`      | Distributed stream                      |
| AStream     | `sync/astream.ts`      | Append-only stream                      |
| SyncTable   | `sync/synctable.ts`    | Table-like sync structure               |
| SyncTableKV | `sync/synctable-kv.ts` | Key-value synctable                     |
| CoreStream  | `sync/core-stream.ts`  | Low-level stream primitive              |

## Persistence

Location: `packages/conat/persist/`

Conat uses SQLite-backed persistent streams (not NATS JetStream):

- `persist/server.ts` — Persistence server
- `persist/storage.ts` — SQLite storage backend
- `persist/auth.ts` — Persistence auth
- `persist/context.ts` — Context management

### Storage Properties

- Per-project/account isolation (separate SQLite files)
- Automatic compression
- TTL-based cleanup for tombstones
- Memory-efficient (SQLite handles data on disk)
