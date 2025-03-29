I just had a look through this code to fix some typescript refactor, and there is an **enormous** amount of code duplication throughout. It's clear that this code was written via a lot of copy/paste, without the corresponding refactoring and cleanup that should come after that and really must be done.

So, dear reader, whoever you are, **please refactor all this code** (!) to not have 10 very similar copies of many things.

Other comments:

- there's a lot of imports that should be "import type".
- there's a lot of interfaces that are partly copy/pasted -- refactor to clarify common structure and as much as possible share typing with @cocalc/util/types/llm, since that's what the frontend uses.  It's always better to have common types shared by the frontend and backend, then hidden internal backend types.

 - William
