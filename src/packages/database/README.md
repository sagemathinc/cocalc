# @cocalc/database

This package connects the hub and nextjs servers to the PostgreSQL database, and implements some nontrivial functionality to support these servers. In particular:

- It implements changefeeds and user queries, which provides a pure JSON language similar to the basics of GraphQL for setting, getting, and subscribing to data in the database. This uses PostgreSQL LISTEN/NOTIFY to send push notifications about changes to tables. It's specifically designed for our data structures, of course, and is not generic. The data structures are currently defined in `@cocalc/util/db-schema`.

## Development

See [DB_DEVELOPMENT.md](./DB_DEVELOPMENT.md) for architecture overview, testing guidelines, and modernization patterns.
