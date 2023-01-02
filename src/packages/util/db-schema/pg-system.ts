/*
Read access to some PostgreSQL system-level tables for admins.

Right now:

 - Virtual tables to count the number of entries in any table.
   These counts are instantly computed but are only approximations. See
   https://stackoverflow.com/questions/7943233/fast-way-to-discover-the-row-count-of-a-table-in-postgresql/7945274#7945274

   E.g., from browser in dev mode, this counts the number of patches instantly... but only approximately:

      (await cc.client.async_query({query:{pg_class:{reltuples:null,relname:'patches'}}})).query.pg_class

*/
import { Table } from "./types";

Table({
  name: "pg_class",
  fields: {
    reltuples: {
      type: "number",
    },
    relname: {
      type: "string",
    },
  },
  rules: {
    primary_key: "relname",
    desc: "A useful system table for approximate count of size of table",
    user_query: {
      get: {
        admin: true,
        pg_where: [],
        fields: {
          reltuples: null,
          relname: null,
        },
      },
    },
  },
});
