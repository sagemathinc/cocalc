Code for querying the backend database.

In CoCalc this database is PostgreSQL, but that is completely
abstracted away. All access goes via the db-schema and user_query
functionality defined in @cocalc/util/db-schema and @cocalc/database
code.

The backend table involves queries:

- are not logged on the backend
- can scan potentially millions of rows
- benefit potentially from the full power and scalability of PostgreSQL

The tables itself:

- are shared by all crm instances
- do not store information about views are how they are being used

Instead the frontend syncdb, which is reflected in the file, stores information about views and also an audit log about what users do and chats about records \(TODO \-\- not implemented yet\).

