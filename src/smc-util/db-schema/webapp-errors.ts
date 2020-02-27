import { Table } from "./types";

Table({
  name: "webapp_errors",
  fields: {
    id: { type: "uuid" },
    account_id: { type: "uuid" },
    name: { type: "string" },
    message: { type: "string" },
    comment: { type: "string" },
    stacktrace: { type: "string" },
    file: { type: "string" },
    lineNumber: { type: "integer" },
    columnNumber: { type: "integer" },
    severity: { type: "string" },
    browser: { type: "string" },
    mobile: { type: "boolean" },
    responsive: { type: "boolean" },
    user_agent: { type: "string" },
    path: { type: "string" },
    smc_version: { type: "string" },
    build_date: { type: "string" },
    smc_git_rev: { type: "string" },
    uptime: { type: "string" },
    start_time: { type: "timestamp" },
    time: { type: "timestamp" },
    expire: { type: "timestamp" }
  },
  rules: {
    primary_key: "id",
    durability: "soft", // loss of some log data not serious, since used only for analytics
    pg_indexes: [
      "time",
      "name",
      "account_id",
      "smc_git_rev",
      "smc_version",
      "start_time",
      "browser"
    ]
  }
});
