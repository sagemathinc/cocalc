# Database Schema Sync

The goal of this code is to ensure that the actual schema in the PostgreSQL
database matches the one defined in `@cocalc/util/db-schema`.

This creates the initial schema, adds new columns, and in a **VERY LIMITED**
range of cases, _might be_ be able to change the data type of a column.

It also creates and updates the CRM versions of subsets of the tables.

## SCHEMA \- DB Schema must be passed in

We do NOT use the global SCHEMA object from @cocalc/util/db\-schema, and instead require a schema object to be passed in. The motivation is a caller could \-\- in a single transaction \-\- set the role to another user:

```sql
SET ROLE crm
```

then call `syncSchema` with a different schema that is specific to CRM. The result would be tables, indexes, etc., all getting created to match the given schema for that user. This way we can easily create the normal tables \(as the smc user\), then create completely different tables for CRM as the crm user, using the exact same code.

## Do NOT use a pool

Since we are changing the role, it's important to not use a pool. We make one
connection, possibly change the role *during that connection*, and use that for
all the schema updates.
