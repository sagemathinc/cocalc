# Chat

WARNING: like all development docs, don't trust anything technical in
this file; instead, only trust the code itself! Nobody ever looks at
docs like this, except people very new to the codebase, hence they tend
to just maximize confusion.

## Timestamps

Note: There are a couple of ways to represent a time in Javascript:

- iso string
- ms since epoch as a number
- string version of ms since epoch
- Date object

The data structures for chat have somehow evolved since that
crazy Sage Days by the Ocean in WA to use all of these at once, which is
confusing and annoying. Be careful!

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

Chat message types after immutable conversion:
(immutable.Map)

```
sender_id : String
event     : String
date      : Date Object
history   : immutable.List of immutable.Maps
editing   : immutable.Map
```
