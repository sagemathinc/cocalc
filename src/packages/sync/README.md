# cocalc-sync:  Realtime Sync Support Code

This is an implementation of realtime synchronization. It has been used heavily in production on https://CoCalc.com for over 5 years.  This is a Javascript library that helps provide collaborative multiuser editing for text files, Jupyter notebooks, and much more.

All code is in Typescript.

## Directories

- [table/](./table) basic foundations for realtime sync
  - a list of object with (possibly compound) primary key
  - synchronized across all clients
  - stored in database
  - NO history
  - NO specific user information or attribution
  - NO merge (last write wins).
  - used as a foundation for editors, but also for other things (e.g., basic project info)
- [editor/](./editor) support for writing collaborative editors
  - A document defined by applying an ordered list of patches on a best effort basis
  - Has support for tracking cursors, history of all changes to document, undo, redo, etc.
  - Different versions:
    - string
    - database table with queries inspired by Cassandra

## How can I use this in my product?

In December 2025, we factored out the core implementation as a standalone lightweight MIT licensed library called [PatchFlow](https://www.npmjs.com/package/patchflow).

The code in this cocalc directory is licensed MS-RSL**: <u>**reference use only**</u>, which prohibits product integration.  But PatchFlow is of course MIT licensed, so you can use it.

## How does this work?

### In particular, does this use CRDT or OT?

No.  This is a realtime sync algorithm for document editing that does _**not**_ use the same algorithm as literally all the other realtime sync projects.  I made up with a different -- **vastly simpler** -- algorithm, inspired a little by "differential sync" and lot by how distributed databases work, and that's what's implemented here.  See [this blog post](https://blog.cocalc.com/2018/10/11/collaborative-editing.html) for more details.

### What are the Pros and Cons of this approach?

This approach works for any document with a notion of "diff" and "patch".  I've used it heavily for everything from plain text, to Jupyter notebook, to WYSIWYG markdown editing (on top of [Slate](https://docs.slatejs.org/)).  One advantage is that you can wait before doing anything related to realtime sync, e.g., if the user is actively typing, it would be very bad to have to do something computationally expensive -- instead, wait until they pause for a second.   This makes it possible to synchronize potentially large complicated documents with minimal lag.

The algorithm itself is easy to understand.  _Each user contributes a stream of patches to a big ordered list.  The definition of the current state of the document is the result of applying all the patches in order on a "best effort" basis._  That's it.  The rest of the algorithm is just a handful of efficient little algorithms for all the standard operations (e.g., undo/redo/rebasing offline changes/etc.), based on that data structure.  To implement this in any particular setting, you have to come up with a way for everybody to eventually agree on the same "big ordered list", and there are many deep (and no so deep) approaches to that problem.

Another advantage is that the algorithm very naturally keeps an immutable history of every single state the document was on.  This makes it easy to create a "TimeTravel" slider to browse through the document history and see who did what.

**UPDATE:** I modified the above algorithm to instead store a directed acyclic graph of changes, to provide much better semantics. E.g., when users commit a specific version of the document, we can always show that exact version of the document later.  The data structure is very similar to the one used by Mercurial.


## Test suite

Make sure to do `npm run build` first, then run the test suite. The build is necessary because
the test suite runs on the compiled files in `dist/`. The test suite should fully pass.

```sh
npm run build && npm run test
```

