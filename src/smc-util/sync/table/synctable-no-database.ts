/*
Make a SyncTable which does not use a changefeed or the central
database at all.

The initial read waits on the client calling a function to provide
the initial data, and all changes are also injected by explicitly
calling a function.  An event is emitted when a new change is made
that has to get saved.

This is used to implement the browser side of project specific
SyncTables.  It's also obviously useful for unit testing.
*/

