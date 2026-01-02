# @cocalc/database

This package connects the hub and nextjs servers to the PostgreSQL database, and implements some nontrivial functionality to support these servers.  In particular:

- It implements changefeeds and user queries, which provides a pure JSON language similar to the basics of GraphQL for setting, getting, and subscribing to data in the database.  This uses PostgreSQL LISTEN/NOTIFY to send push notifications about changes to tables.  It's specifically designed for our data structures, of course, and is not generic.  The data structures are currently defined in `@cocalc/util/db-schema`.

## Notes

**WARNING**: This is the single scariest chunk of CoffeeScript left in CoCalc! 

## Experimental PGlite

There is an opt-in PGlite smoke test helper under [src/packages/database/pglite](./src/packages/database/pglite). It is not wired into the default DB path; use it only for local experiments.
