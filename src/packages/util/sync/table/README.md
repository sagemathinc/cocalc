# SYNCHRONIZED TABLE --

## Defined by an object query

- Do a query against a PostgreSQL table using our object query description.

- Synchronization with the backend database is done automatically.

## Methods

- constructor(query): query = the name of a table (or a more complicated object)

- set(map): Set the given keys of map to their values; one key must be
  the primary key for the table. NOTE: Computed primary keys will
  get automatically filled in; these are keys in schema.coffee,
  where the set query looks like this say:
  (obj, db) -> db.sha1(obj.project_id, obj.path)
- get(): Current value of the query, as an immutable.js Map from
  the primary key to the records, which are also immutable.js Maps.
- get(key): The record with given key, as an immutable Map.
- get(keys): Immutable Map from given keys to the corresponding records.
- get_one(): Returns one record as an immutable Map (useful if there
  is only one record)

- close(): Frees up resources, stops syncing, don't use object further

## Events

- 'before-change': fired right before (and in the same event loop) actually
  applying remote incoming changes

- 'change', [array of string primary keys] : fired any time the value of the query result
  changes, _including_ if changed by calling set on this object.
  Also, called with empty list on first connection if there happens
  to be nothing in this table. If the primary key is not a string it is
  converted to a JSON string.
- 'disconnected': fired when table is disconnected from the server for some reason
- 'connected': fired when table has successfully connected and finished initializing
  and is ready to use
- 'saved', [array of saved objects]: fired after confirmed successful save of objects to backend

## States

A SyncTable is a finite state machine as follows:

                          -------------------<------------------
                         \|/                                   |
    [connecting] --> [connected]  -->  [disconnected]  --> [reconnecting]

Also, there is a final state called 'closed', that the SyncTable moves to when
it will not be used further; this frees up all connections and used memory.
The table can't be used after it is closed. The only way to get to the
closed state is to explicitly call close() on the table; otherwise, the
table will keep attempting to connect and work, until it works.

    (anything)  --> [closed]

- connecting -- connecting to the backend, and have never connected before.

- connected -- successfully connected to the backend, initialized, and receiving updates.

- disconnected -- table was successfully initialized, but the network connection
  died. Can still takes writes, but they will never try to save to
  the backend. Waiting to reconnect when user connects back to the backend.

- reconnecting -- client just reconnected to the backend, so this table is now trying
  to get the full current state of the table and initialize a changefeed.

- closed -- table is closed, and memory/connections used by the table is freed.

## Worry

What if the user does a set and connecting (or reconnecting)
takes a long time, e.g., suspend a laptop, then resume?
The changes may get saved... a month later. For some things,
e.g., logs, this could be fine. However, on reconnect, the first
thing is that complete upstream state of table is set on
server version of table, so reconnecting user only sends
its changes if upstream hasn't changed anything in
that same record.

## Representation

We represent synchronized tables by an immutable.js mapping from the primary
key to the object. Since PostgresQL primary keys can be compound (more than
just strings), e.g., they can be arrays, so we convert complicated keys to their
JSON representation. A binary object doesn't make sense here in pure javascript,
but these do:

      string, number, time, boolean, or array

Everything automatically converts fine to a string except array, which is the
main thing this function deals with below.

### Notes

1. RIGHT NOW: This should be safe to change at
   any time, since the keys aren't stored longterm.
   If we do something with localStorage, this will no longer be safe
   without a version number.

2. Of course you could use both a string and an array as primary keys
   in the same table. You could evily make the string equal the json of an array,
   and this _would_ break things. We are thus assuming that such mixing
   doesn't happen. An alternative would be to just _always_ use a _stable_ version of stringify.

3. We use a stable version, since otherwise things will randomly break if the
   key is an object.
