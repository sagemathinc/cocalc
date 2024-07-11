import { Table } from "./types";

export interface UsageProfile {
  time: Date; // when it was computed
  account_id: string;
  // all time total purchases divided up by service
  purchases_by_service_total: {
    [service: string]: number;
  };
  // the balance at this point in time, which is always the sum of the total purchases.
  balance: number;
  file_access_by_ext_total: {
    [ext: string]: number;
  };
  // total of all file access across all extensions (except empty)
  file_access_total: number;
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
    purchases_by_service_total: {
      type: "map",
      pg_type: "jsonb",
      desc: "The total amount the user purchased up until this point in time.",
    },
    balance: {
      type: "number",
      desc: "Account balance at this point in time (as represented on statement), which is the sum of purchases across all services.",
    },
    file_access_by_ext_total: {
      type: "map",
      pg_type: "jsonb",
      desc: "number of times this user has accessed files with given extension",
    },
    file_access_total: {
      type: "number",
      desc: "Total file access across all extensions at this point",
    },
  },
});
