/*
 * license
 */

// This is a table of the compute servers.
//   It was mainly used long, long ago before
//   we switched to Kubernetes for our main
//   backend.  It is *still* used now in some
//   special case (with localhost), e.g., for
//   the docker image.  So don't get rid of it!

import { Table } from "./types";

Table({
  name: "compute_servers",
  rules: {
    primary_key: "host",
  },
  fields: {
    host: {
      type: "string",
      pg_type: "VARCHAR(63)",
    },
    dc: {
      type: "string",
    },
    port: {
      type: "integer",
    },
    secret: {
      type: "string",
    },
    experimental: {
      type: "boolean",
    },
    member_host: {
      type: "boolean",
    },
    status: {
      type: "map",
      desc: "something like {stuff:?,...,timestamp:?}",
      date: ["timestamp"],
    },
  },
});
