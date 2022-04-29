# Chat

WARNING: like all development docs, don't trust anything technical in
this file; instead, only trust the code itself!  Nobody ever looks at
docs like this, except people very new to the codebase, hence they tend
to just maximize confusion...

## Usage

Only import from `main.coffee`.
You should not need to import from any other file.

It allows you to:

- Initialize stores and actions for a chat
- Render that chat
- Destroy the same stores and actions

## Overview

CoCalc has several chat view considerations.

- Side chat associated with files
- Primary chat rooms (also a file)
- Mobile and Desktop versions of both

The constricting factors are primarily keyboard related or screen size related.
ie. You cannot use certain hotkeys without a physical keyboard and certain things don't fit well on a smaller screen.

opening side chat on mobile should "slide over" the main document. Basically, don't try to split the screen.
side chat mobile should be identical to primary chat mobile.
side chat desktop should expand to primary chat desktop when it's dragged open across the screen

If some method returns a child and has IS_MOBILE at the top, it should be its own component

Use IS_MOBILE closest to where it matters.

## The View Components

### Primary

#### side_chat.cjsx

- describes the toggleable chat on the side of all files
- imports and adjusts `base_chat.cjsx`

#### editor_chat.cjsx

- describes the dedicated editor when you open a `.sage-chat` file
- imports and adjusts `base_chat.cjsx`

#### base_chat.cjsx

- Core display of our chat module
- Takes options to display or not display various components

### Supporting Components

- MessageTimeago
- UserName

## Actions, Stores, and Sync

Nothing special here.

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
