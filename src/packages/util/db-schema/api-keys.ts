import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";

export type Action = "get" | "delete" | "create" | "edit";

export interface ApiKey {
  id: number;
  account_id: string;
  created: Date;
  hash?: string; // usually NOT available
  trunc: string;
  project_id?: string; // only for project api keys
  expire?: Date;
  name: string;
  last_active?: Date;
  secret?: string; // only when initially creating the key (and never in database)
}

Table({
  name: "api_keys",
  fields: {
    id: ID,
    account_id: CREATED_BY, // who made this api key
    expire: {
      type: "timestamp",
      desc: "When this api key expires and is automatically deleted.",
    },
    created: {
      type: "timestamp",
      desc: "When this api key was created.",
    },
    hash: {
      type: "string",
      pg_type: "VARCHAR(173)",
      desc: "Hash of the api key. This is the same hash as for user passwords, which is 1000 iterations of sha512 with salt of length 32.",
    },
    name: {
      type: "string",
      pg_type: "VARCHAR(128)",
      desc: "user defined name of this key",
    },
    trunc: {
      type: "string",
      pg_type: "VARCHAR(16)",
      desc: "Truncated version of the actual api key, suitable for display to remind user which key it is.",
    },
    project_id: {
      type: "uuid",
      desc: "Optional uuid of the project that this api key applies to.  If not set, api key is global.",
    },
    last_active: {
      type: "timestamp",
      desc: "When this api key was last used.",
    },
  },
  rules: {
    primary_key: "id",
    pg_indexes: [
      "((created IS NOT NULL))",
      "((account_id IS NOT NULL))",
      "project_id",
    ],
  },
});
