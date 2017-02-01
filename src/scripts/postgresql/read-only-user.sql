/*
Read-only users

The following sets the permissions to disable table creation, grants it to the `smc` user, and creates a read-only `smcro` user.

$ psql -a -f read-only-user.sql

After that, connect via psql like that:

$ PGUSER=smcro psql smc

Note: one has to specify the table name as the first argument.
*/

-- This will prevent default users from creating tables
REVOKE CREATE ON SCHEMA public FROM public;

-- allow smc to create tables
-- superusers will always be able to create tables anyway
GRANT CREATE ON SCHEMA public to "smc";

-- read-only user smcro
CREATE ROLE smcro;
ALTER ROLE smcro WITH LOGIN;
GRANT CONNECT ON DATABASE smc TO "smcro";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "smcro";

-- Grant USAGE to everyone, such that listing tables via \d works
GRANT USAGE ON SCHEMA public TO public;

/* To delete the user, run these statements (as the 'smc' super-user, obviously)

DROP OWNED BY smcro;
DROP USER smcro;

*/