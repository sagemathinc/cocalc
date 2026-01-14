# Conat Persist Service

This service provides durable storage for conat streams and kv stores without
Jetstream. It uses sqlite on disk and a conat socket protocol for access. The
subject is only used for auth and routing; the actual stream or kv name comes
from a storage path sent in the first message.

## What this is

- A persist server listens on subjects like `persist.project-<id>`.
- Clients open a virtual socket (modeled after TCP) and send a `storage.path`.
- The server opens a sqlite file for that path and serves stream/kv requests.
- Higher-level APIs (dstream/dkv/astream/akv) are built on top of this.

This avoids subject-based stream naming, so you are not limited to NATS subject
characters.

## Subject and auth

The subject only encodes scope and authorization. It does not name the stream.
See persistSubject in [src/packages/conat/persist/util.ts](./src/packages/conat/persist/util.ts).

Examples:

- persist.project-<project_id>
- persist.account-<account_id>
- persist.host-<host_id>
- persist.hub

The server verifies that `storage.path` is normalized and rooted under the
scope implied by the subject (projects/<id>/..., accounts/<id>/..., etc.).

## Storage path and sqlite files

The client sends a `storage` object on the socket:

```
{ path: "projects/<project_id>/lro.<op_id>" }
```

`storage.path` maps directly to a sqlite filename after resolution by
resolveLocalPath in [src/packages/conat/persist/util.ts](./src/packages/conat/persist/util.ts).
The mapping uses `syncFiles.localProjects`, `syncFiles.localAccounts`, etc.

## Client protocol (high level)

1. Connect to `persist.<scope>` via conat socket.
2. Send `{ storage, changefeed }` once on that socket.
3. Server opens the sqlite file for `storage.path`.
4. Subsequent requests are sent over the socket:
   - set, setMany, get, delete, getAll, keys, config, inventory, changefeed
5. Changefeed updates are pushed to the socket when enabled.

The concrete protocol is implemented in
[src/packages/conat/persist/server.ts](./src/packages/conat/persist/server.ts)
and [src/packages/conat/persist/client.ts](./src/packages/conat/persist/client.ts).

## Scaling and load balancing

- Multiple persist servers can run at once.
- A lightweight load balancer answers requests on `persist.*.id` and returns a
  server id based on a stable hash of the scope.
- The goal is consistent assignment so changefeeds remain coherent.

There is no central coordinator or heartbeat-based rebalancing. If a server
disappears, clients reconnect and ask for a new id.

## Storage and retention

- SQLite uses WAL and can be shared on a common filesystem.
- Optional archive/backup roots can be configured via `syncFiles` for tiered
  storage.
- Message TTLs and tombstones are supported by the core stream layer.

## Notes

- This is not NATS Jetstream. It is a separate persistence layer with its own
  protocol and on-disk format.
- The persist subject is intentionally simple so paths can be arbitrary.
