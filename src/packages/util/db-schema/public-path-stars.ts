import { Table } from "./types";

export interface PublicPathStar {
  public_path_id: string;
  account_id: string;
  time: Date;
}

Table({
  name: "public_path_stars",
  fields: {
    public_path_id: {
      type: "string",
      pg_type: "CHAR(40)",
    },
    account_id: {
      type: "uuid",
    },
    time: {
      type: "timestamp",
      desc: "when this star was created",
    },
  },
  rules: {
    primary_key: ["public_path_id", "account_id"],
    pg_indexes: ["public_path_id", "account_id"],
  },
});
