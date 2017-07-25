# Chat layout
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
