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
    model: {
      desc: "The model that defines active users, e.g., 'file_access_log'. This determines the cohort and how active is measured, via code that is hardcoded in cocalc's source code.  E.g., 'project_log:paid' might mean that we use entries in the project_log to define activity and restrict to paying customers only to define the cohort.",
      type: "string",
    },
    period: {
      desc: "We measure cohorts for [start,start+period), [start+period, stop+period), [start+2*period, end+2*period), ...",
      pg_type: "interval",
      type: "string",
    },
    active: {
      desc: "The number of distinct accounts in the cohort that were active during each period.  This is an array of integers.",
      pg_type: "integer[]",
      type: "array",
    },
    size: {
      desc: "The number of accounts in this cohort.",
      type: "integer",
    },
  },
  rules: {
    desc: "CRM Retention Table",
    primary_key: ["start", "stop", "model", "period"],
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          start: null,
          stop: null,
          model: null,
          period: null,
          active: null,
          size: null,
        },
      },
    },
  },
});
