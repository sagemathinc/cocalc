# Generic Realtime Sync Support Code

This is an implementation of realtime synchronization. It has been used heavily in production on https://CoCalc.com for over 5 years.

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

## How can I use this in my product

As of November 2021, you shouldn't and probably can't for the following reasons:

- In addition to the core sync library, **you also need a way to transmit data** between all the parties involved in sync.  This is equally important and difficult, and how to best do this often depends on your application.   There's no documentation at all for @cocalc/sync, except what's in the comments, and no examples (except cocalc itself), so this would be difficult.
- **The license is currently AGPL3 + common clause non-commercial only**, which is obviously very unfriendly in terms of product integration.  I'm seriously considering relicensing @cocalc/sync and @cocalc/util as MIT -- if you want to encourage me to do so, email [wstein@gmail.com](mailto:wstein@gmail.com).

## How does this work?

### In particular, does this use CRDT or OT?

No.  This is a realtime sync algorithm for document editing that does _**not**_ use the same algorithm as literally all the other realtime sync projects.  I made up with a different -- **vastly simpler** -- algorithm, inspired a little by "differential sync" and lot by how distributed databases work, and that's what's implemented here.  See [this blog post](https://blog.cocalc.com/2018/10/11/collaborative-editing.html) for more details.

### What are the Pros and Cons of this approach?

This approach works for any document with a notion of "diff" and "patch".  I've used it heavily for everything from plain text, to Jupyter notebook, to WYSIWYG markdown editing (on top of [Slate](https://docs.slatejs.org/)).  One advantage is that you can wait before doing anything related to realtime sync, e.g., if the user is actively typing, it would be very bad to have to do something computationally expensive -- instead, wait until they pause for a second.   This makes it possible to synchronize potentially very large complicated documents with minimal lag.

The algorithm itself is ridiculously easy to understand.  It's surely the simplest actually useful realtime sync algorithm I've ever seen.  _Each user contributes a stream of patches to a big ordered list.  The definition of the current state of the document is the result of applying all the patches in order on a "best effort" basis._  That's it.  The rest of the algorithm is just a handful of efficient little algorithms for all the standard operations (e.g., undo/redo/rebasing offline changes/etc.), based on that data structure.  To implement this in any particular setting, you have to come up with a way for everybody to eventually agree on the same "big ordered list", and there are many deep (and no so deep) approaches to that problem.

Another advantage is that the algorithm very naturally keeps an immutable history of every single state the document was on.  This makes it easy to create a "TimeTravel" slider to browse through the document history and see who did what.

## Test suite

Make sure to do `npm run build` first, then run the test suite. The build is necessary because
the test suite runs on the compiled files in `dist/`. The test suite should fully pass.

```sh
npm run build && npm run test
```
