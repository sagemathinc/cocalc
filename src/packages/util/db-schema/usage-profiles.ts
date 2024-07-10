import { Table } from "./types";

export interface UsageProfile {
  time: Date; // when it was computed
  account_id: string;
  // all time total purchases divided up by service
  total_purchases: {
    [service: string]: number;
  };
  total_file_access: {
    [ext: string]: number;
  };
}

Table({
  name: "usage_profiles",
  rules: {
    primary_key: ["time", "account_id"],
  },
  fields: {
    account_id: {
      type: "uuid",
      desc: "The uuid that determines the user account",
      render: { type: "account" },
      title: "Account Id",
    },
    time: {
      type: "timestamp",
      desc: "When the profile was computed.",
    },
    total_purchases: {
      type: "map",
      pg_type: "jsonb",
      desc: "The total amount the user purchased up until this point in time.",
    },
    total_file_access: {
      type: "map",
      pg_type: "jsonb",
      desc: "number of times this user has accessed files with given extension",
    },
  },
});
