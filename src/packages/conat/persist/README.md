# Persistence Service

The goal is to provide a tiered, memory efficient, scalable way to persist
streams and kv stores, without using Jetstream. This should use only the core
pub/sub functionality of NATS, so we can switch to other pub/sub systems later.

## API

Given a subject that the requesting user has access to, this service can do the following.

Message = {value?:Buffer, headers?:Headers, timestamp?:number}

- set: \(subject, seq:number, message}\)
- get: \({subject, seq:number}\) =&gt; Message
- delete: \({subject, seq:number}\)
- getAll: \({subject, start\_seq?:number}\) =&gt; Message\[\], as sequence of messages
  - if start\_seq given, gets only messages &gt;= start\_seq
- deleteAll:\({subject, end\_seq?:number}\)
  - if end\_seq given, deletes only messages &lt;= end\_seq

Moreover, every time one client makes a change, a corresponding message gets
published so all other clients can update their state. This will use exactly
the protocol implemented in core-stream.ts right now.

Notes:

- We use chunking so there are no limits on message size.
- There is no history for kv, i.e., only the last value is saved. (kv is **not** implemented
  on top of streams like in NATS; it is its own thing)
- Messages can be deleted in a stream.

## Architecture:

- There can be a large number of persist services.   These servers a single threaded and
  may require substantial RAM and cpu to do their work, so we have to be able easily scale
  the number up and down.

- Each stream storage server has:
  
  - mounts a common shared filesystem across all persistence servers.
  - (optional) access to a common cloud storage bucket for longterm cheap 
    high-latency tiered storage.
    
- One load balancer that decided which persistence server should server a given stream.

  - coordinator persists its state to the common shared filesystem as well.
  - This defines a map 
          
          (stream) |--> (persist server)
          
    that changes only when a persist server terminates.
    The persist servers send periodic heartbeats to coordinator and the coordinator
    allocates stream work ONLY to persist servers that have sent a recent heartbeat.
  - When coordinator is restarted there's a short period when new clients can't
    open a stream. Existing clients keep using the streams as before.
  - The obvious problem with this approach is if persist server A is working fine
    but somehow communication with the coordinator stops, then the coordinator
    switches the stream to use persist server B and some clients use B, but some
    clients are still using persist server A.  Basically, split brain.
    If this happened though server A and server B are still using the same sqlite
    file (over NFS) so there's still locking at the NFS level. The loss would be
    that users would not see each other's changes.  If there's split brain though,
    that means our pub/sub layer is fundamentally broken, so it's acceptable that
    users aren't seeing each other's changes in such a scenario.

  
Requirements:

 - must scale up a lot, e..g, imagine 10,000 simultaneous users, doing a lot with terminals, editing, jupyter, etc., all at once -- that's well over 10K+ messages/second to this system
 - efficient in terms of cost
 - a minute of downtime for a subset of streams once in a while is ok; global downtime for all streams would be very bad.
 - very small amount of data loss (e.g., last few seconds of edit history) is ok
 
  

## Protocol:

- When any client wants to use a subject, it makes a request to the coordinator asking which
  persistence server it should use. The coordinator selects from active persistence servers
  and it makes a consistent assignment. If a persistence servers stops working or vanishes,
  clients will again make a request, and the coordinator will answer, possibly with a
  different server.
  - A persistence server is the analogue of a NATS jetstream node. We use
    a coordinator so there is no need for RAFT. Using cloud storage provides
    tiered storage. Only accessing the sqlite file when there's a request lets
    us scale to an unlimited number of subjects but maintain very fast
    startup time.
- Client makes requests as mentioned above to a specific named persistence server.

- When server gets such a request, it opens the subject by copying the sqlite3 file from
  cloud storage to a local disk if necessary, then queries it and responds.
- Periodically the server copies the sqlite3 file from local disk to cloud storage.

