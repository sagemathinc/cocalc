# Database Schema Sync

The goal of this code is to ensure that the actual schema in the PostgreSQL
database matches the one defined in `@cocalc/util/db-schema`.

This creates the initial schema, adds new columns, and in a **VERY LIMITED**
range of cases, _might be_ be able to change the data type of a column.

## SCHEMA \- DB Schema must be passed in

We do NOT use the global SCHEMA object from @cocalc/util/db\-schema, and instead require a schema object to be passed in. The motivation is a caller could \-\- in a single transaction \-\- set the role to another user:

```sql
SET ROLE crm
```

then call `syncSchema` with a different schema that is specific to something else. The result would be tables, indexes, etc., all getting created to match the given schema for that user. This way we can easily create the normal tables \(as the smc user\), then create completely different tables for something else, using the exact same code.  

NOTE: That said **we do not actually use this capability.**  I wrote this to support some separate CRM integration, which I ended up deleting.

### Do NOT use a pool

Since we are supporting changing the role, it's important to not use a pool. We make one
connection, possibly change the role _during that connection_, and use that for
all the schema updates. 

Again, violating this wouldn't matter in practice since we do not use this capability.
