# Chat

## State / normalization (2025-02)

- Chat data now lives in a single source of truth: the SyncDoc backed by Patchflow/Immer. `message-cache.ts` listens to SyncDoc change events and exposes a plain `Map<string, ChatMessage>` (keyed by the thread root date in milliseconds as a string). Messages are stored as the raw frozen syncdb objects to avoid extra copies.
- Normalization upgrades legacy rows (adds `schema_version`, coerces dates, flattens history/payload) and writes the upgraded record back once so disk stays consistent.
- The Redux store still uses immutable.js for unrelated UI state, but chat messages themselves are plain JS objects served from the cache/context.

## Timestamps

- Stored on disk as ISO strings; in memory we normalize to `Date` objects for all chat messages.
- Thread keys and message keys use the millisecond timestamp as a string (e.g., `"1733958748000"`). Callers are expected to pass keys in that form.

## Overview

CoCalc has two chat views.

- Side chat associated with files
- Primary chat rooms \(also a file\)

The constricting factors are primarily keyboard related or screen size related.
ie., you cannot use certain hotkeys without a physical keyboard and certain things don't fit well on a smaller screen.

## JSON message format

```
sender_id : String which is the original message sender's account id
event     : "chat" or "draft".  It's not really an "event"; type would have been better.
date      : A date string
history   : Array of "History" objects (described below)
editing   : Object of <account id's> : <"FUTURE">
```

"FUTURE" Will likely contain their last edit in the future

--- History object ---

```
author_id : String which is this message version's author's account id
content   : The raw display content of the message
date      : Date **string** of when this edit was sent
```

Example object:

```
{"sender_id":"07b12853-07e5-487f-906a-d7ae04536540",
"event":"chat",
"history":[
        {"author_id":"07b12853-07e5-487f-906a-d7ae04536540","content":"First edited!","date":"2016-07-23T23:10:15.331Z"},
        {"author_id":"07b12853-07e5-487f-906a-d7ae04536540","content":"Initial sent message!","date":"2016-07-23T23:10:04.837Z"}
        ],
"date":"2016-07-23T23:10:04.837Z","editing":{"07b12853-07e5-487f-906a-d7ae04536540":"FUTURE"}}
```

---

Chat message shape after normalization (plain JS):

```
sender_id : string
event     : "chat" | "draft"
date      : Date          // normalized from stored ISO
history   : MessageHistory[]  // newest first
editing   : string[]      // account_ids currently editing
schema_version : number   // current schema version written back to disk
```
