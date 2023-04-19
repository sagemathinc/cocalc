import { Table } from "./types";

Table({
  name: "crm_retention",
  fields: {
    start: {
      desc: "The cohort consists of accounts created >= start and < end.",
      type: "timestamp",
    },
    stop: {
      desc: "Defines the stoping timestamp of this cohort",
      type: "timestamp",
    },
    table_name: {
      desc: "The table that defines active users, e.g., 'file_access_log', 'project_log', 'user_tracking' in this cohort.",
      type: "string",
    },
    size: {
      desc: "The number of accounts in this cohort.",
      type: "integer",
    },
    period: {
      desc: "We measure cohorts for [start,start+period), [start+period, stop+period), [start+2*period, end+2*period), ...",
      pg_type: "interval",
      type: "string",
    },
    data: {
      desc: "The number of distinct accounts in the cohort that were active during each period.  This is just an array of integers.",
      pg_type: "integer[]",
      type: "array",
    },
  },
  rules: {
    desc: "CRM Retention Table",
    primary_key: ["start", "stop", "table_name"],
  },
});
