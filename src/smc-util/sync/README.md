# Generic Realtime Sync Support Code

- table: basic foundations for sync
  - a list of object with (possibly compound) primary key
  - synchronized across all clients
  - stored in database
  - NO history
  - NO specific user information or attribution
  - NO merge (last write wins).
  - used as a foundation for editors, but also for other things (e.g., basic project info)

* editor: support for writing collaboative editors
  - A document defined by applying an ordered list of patches on a best effort basis
  - Has support for tracking cursors, history of all changes to document, undo, redo, etc.
  - Different versions:
    - string
    - database table with queries inspired by Cassandra
