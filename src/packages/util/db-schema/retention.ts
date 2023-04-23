import { Table } from "./types";

export const retentionModels = {
  file_access_log: {
    title: "Cohort Retention (File Access Log)",
    description:
      "Number of accounts in the cohort with an entry in the file_access_log during each period.",
  },
  "file_access_log:all": {
    title: "Active Users (File Access Log)",
    description:
      "Number of accounts with an entry in the file_access_log during each period.",
  },
  openai_chatgpt_log: {
    title: "Cohort Retention (of ChatGPT users)",
    description:
      "Number of accounts in the cohort that used chatgpt during period.",
  },
  "openai_chatgpt_log:all": {
    title: "Active Users (of ChatGPT)",
    description:
      "Number of accounts with an entry in the openai_chatgpt_log during each period.",
  },
};

export type RetentionModel = keyof typeof retentionModels;

Table({
  name: "crm_retention",
  fields: {
    start: {
      title: "Cohort Start",
      desc: "The cohort consists of accounts created >= start and < end, unless otherwise stated by the model definition.  E.g., if the model name ends in :all, then the cohort is simply all accounts ever created.",
      type: "timestamp",
    },
    stop: {
      title: "Cohort Stop",
      desc: "Defines the stoping timestamp of this cohort",
      type: "timestamp",
    },
    model: {
      desc: "The model that defines active users, e.g., 'file_access_log', 'file_access_log:all'. This determines the cohort and how active is measured, via code that is hardcoded in cocalc's source code.  E.g., 'project_log:paid' might mean that we use entries in the project_log to define activity and restrict to paying customers only to define the cohort.",
      type: "string",
    },
    period: {
      title: "Active Period",
      desc: "We measure activity of the cohort for the intervals [start,start+period), [start+period, start+2*period), [start+2*period, start+3*period), ..., [last_start_time, last_start_time+period), where last_start_time is defined below.",
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
      desc: "The number of accounts in this cohort.  In case of ':all' models, this is total number of users that were active during all periods considered.",
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
