# Database Schema Sync

The goal of this code is to ensure that the actual schema in the PostgreSQL 
database  matches the one defined in `@cocalc/util/db-schema`.

This creates the initial schema, adds new columns, and in a **VERY LIMITED**
range of cases, _might be_ be able to change the data type of a column.

It also creates and updates the CRM versions of subsets of the tables.
