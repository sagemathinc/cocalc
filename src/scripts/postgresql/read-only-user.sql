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
CREATE ROLE readonly;
ALTER ROLE readonly WITH LOGIN;
GRANT CONNECT ON DATABASE smc TO "readonly";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "readonly";

-- hsy user
CREATE USER hsy IN GROUP readonly PASSWORD '<secret>';

-- Grant USAGE to everyone, such that listing tables via \d works
GRANT USAGE ON SCHEMA public TO public;

/*

To actually enable the user hsy, also the pg_hba.conf file needed this line:
host    all hsy all md5

and then re-reading the configuration via:

SELECT pg_reload_conf();

*/

/* To delete the user, run these statements (as the 'smc' super-user, obviously)

DROP OWNED BY hsy;
DROP USER hsy;

*/