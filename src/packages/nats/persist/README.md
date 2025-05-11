# Persistence Service

The goal is to provide a tiered, memory efficient, scalable way to persist
streams and kv stores, without using Jetstream. This should use only the core
pub/sub functionality of NATS, so we can switch to other pub/sub systems later.

## API

Given a location that the requesting user has access to, this service can do the following.

Message = {value?:Buffer, headers?:Headers, timestamp?:number}

- set: ({location, seq:number, message})
- get: ({location, seq:number}) => Message
- delete: ({location, seq:number})
- getAll: ({location, start_seq?:number}) => Message[], as sequence of messages
  - if start_seq given, gets only messages >= start_seq
- deleteAll:({location, end_seq?:number})
  - if end_seq given, deletes only messages <= end_seq

Moreover, every time one client makes a change, a corresponding message gets
published so all other clients can update their state. This will use exactly
the protocol implemented in ephemeral-stream.ts right now.

Notes:

- We use chunking so there are no limits on message size.
- There is no history for kv, i.e., only the last value is saved. (kv is **not** implemented
  on top of streams like in NATS; it is its own thing)
- Messages can be deleted in a stream.

## Architecture:

- many persistence servers

- The persistence servers have local persistent disk storage and access to a common cloud
  storage bucket (or common NFS mount) for longterm cheap high-latency tiered storage.

- One coordinator, which knows state of persistence servers. It has persistent disk
  storage to maintain state, even if it is restarted.

## Protocol:

- When any client wants to use a location, it makes a request to the coordinator asking which
  persistence server it should use. The coordinator selects from active persistence servers
  and it makes a consistent assignment. If a persistence servers stops working or vanishes,
  clients will again make a request, and the coordinator will answer, possibly with a
  different server.
  - A persistence server is the analogue of a NATS jetstream node. We use
    a coordinator so there is no need for RAFT. Using cloud storage provides
    tiered storage. Only accessing the sqlite file when there's a request lets
    us scale to an unlimited number of locations but maintain very fast
    startup time.
- Client makes requests as mentioned above to a specific named persistence server.

- When server gets such a request, it opens the location by copying the sqlite3 file from
  cloud storage to a local disk if necessary, then queries it and responds.
- Periodically the server copies the sqlite3 file from local disk to cloud storage.
