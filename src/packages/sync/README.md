# Generic Realtime Sync Support Code

This is an implementation of realtime synchronization.  It has been used heavily in production on https://CoCalc.com for over 5 years.

All code is in Typescript.

## Directories

- **table:** basic foundations for realtime sync
  - a list of object with (possibly compound) primary key
  - synchronized across all clients
  - stored in database
  - NO history
  - NO specific user information or attribution
  - NO merge (last write wins).
  - used as a foundation for editors, but also for other things (e.g., basic project info)
- **editor:** support for writing collaborative editors
  - A document defined by applying an ordered list of patches on a best effort basis
  - Has support for tracking cursors, history of all changes to document, undo, redo, etc.
  - Different versions:
    - string
    - database table with queries inspired by Cassandra

## Test suite

When I first wrote this code, I also wrote a test suite using jest.  It doesn't run right now though, due to api changes in jest.
