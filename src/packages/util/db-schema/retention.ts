import { Table } from "./types";

Table({
  name: "crm_retention",
  fields: {
    start: {
      title: "Cohort Start",
      desc: "The cohort consists of accounts created >= start and < end.",
      type: "timestamp",
    },
    stop: {
      title: "Cohort Stop",
      desc: "Defines the stoping timestamp of this cohort",
      type: "timestamp",
    },
    model: {
      desc: "The model that defines active users, e.g., 'file_access_log'. This determines the cohort and how active is measured, via code that is hardcoded in cocalc's source code.  E.g., 'project_log:paid' might mean that we use entries in the project_log to define activity and restrict to paying customers only to define the cohort.",
      type: "string",
    },
    period: {
      title: "Active Period",
      desc: "We measure cohorts for [start,start+period), [start+period, stop+period), [start+2*period, end+2*period), ...",
      pg_type: "interval",
      type: "string",
    },
    last_start_time: {
      title: "Start of last data",
      desc: "The start time of the last interval that's in the active array. We can use this to easily tell if there is missing data or not.",
      type: "timestamp",
    },
    active: {
      title: "Active Accounts",
      desc: "The number of distinct accounts in the cohort that were active during each period.  This is an array of integers.",
      pg_type: "integer[]",
      type: "array",
    },
    size: {
      title: "Cohort Size",
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
          last_start_time: null,
          active: null,
          size: null,
        },
        async check_hook(db, obj, _account_id, _project_id, cb) {
          // The check hook ensures the data that is being requested exists
          // and is up to date.  It's not really "checking" for validity, but
          // that it is up to date.
          try {
            await db.updateRetentionData(obj);
            cb();
          } catch (err) {
            cb(err);
          }
        },
      },
    },
  },
});
