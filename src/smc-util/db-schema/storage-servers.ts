/* This is a table of the store servers.  Like compute_servers,
   it was mainly used long, long ago before
   we switched to Kubernetes for our main
   backend... and it is *still* used now in some
   special case (with localhost), e.g., for
   the docker image.  So don't get rid of it!
 */

import { Table } from "./types";

Table({
  name: "storage_servers",
  rules: {
    primary_key: "host"
  },
  fields: {
    host: {
      type: "string",
      desc: "hostname of the storage server",
      pg_type: "VARCHAR(63)"
    }
  }
});
