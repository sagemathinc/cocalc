/*
Table that record accumulated daily usage of a given public path.
This is for:

- avoiding abuse: detecting excessive bandwidth egress
- value: knowing which public paths are "trending" in terms of popularity

We record bandwidth usage for each file in a share individually, rather
than aggregating everything across a share.  E.g., loading a page could
hit 10 images in the share, and we don't want that to count 10 times.
*/

import { Table } from "./types";

export interface PublicPathUsage {
  id: string;
  count: number;
  bytes: number;
}

Table({
  name: "public_path_usage",
  fields: {
    id: {
      title: "Public path id",
      desc: "The public path id (a sha1 hash) that contains this file.",
      type: "string",
      pg_type: "CHAR(40)",
    },
    date: {
      title: "Date",
      desc: "The day for which we are recording usage. This is just the day, not the time during a day.",
      type: "timestamp",
      pg_type: "date",
    },
    filename: {
      title: "Filename",
      desc: "A filename of a file in the public share.",
      type: "string",
    },
    count: {
      title: "Count",
      desc: "How many times this filename was downloaded today.",
      type: "number",
      pg_type: "integer",
    },
    megabytes: {
      title: "MB Downloaded",
      desc: "Count of number of megabytes downloaded today, as a decimal floating point number.",
      type: "number",
      pg_type: "decimal",
    },
  },
  rules: {
    primary_key: ["date", "id", "filename"],
    pg_indexes: ["date", "id", "filename"],
    user_query: {
      get: {
        admin: true, // only admins can do get queries on this table
        // (without this, users who have read access could read)
        pg_where: [],
        options: [{ limit: 300, order_by: "-date" }],
        fields: {
          id: null,
          date: null,
          filename: null,
          count: null,
          megabytes: null,
        },
      },
    },
  },
});
