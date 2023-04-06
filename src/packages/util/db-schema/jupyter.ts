import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";

export interface JupyterLogEntry {
  id: number;
  time: Date;
  input: string;
  history?: string[];
  output: object[];
  project_id?: string;
  path?: string;
  hash: string;
  kernel: string;
  account_id?: string;
  analytics_cookie?: string; // at least one of analytics_cookie or account_id will be set
  tag?: string; // useful for keeping track of where queries come frome when doing analytics later
  expire?: Date;
  total_time_s: number; // how long the request took in s
}

Table({
  name: "jupyter_execute_log",
  fields: {
    id: ID,
    time: { type: "timestamp", desc: "When this particular execute happened." },
    analytics_cookie: {
      title: "Analytics Cookie",
      type: "string",
      desc: "The analytics cookie for the user that asked this question.",
    },
    account_id: CREATED_BY,
    input: {
      title: "Input",
      type: "string",
      desc: "Input text that was sent to kernel",
      render: {
        type: "markdown",
      },
    },
    output: {
      title: "Output",
      type: "array",
      pg_type: "JSONB[]",
      desc: "Output from running the computation",
    },
    hash: {
      type: "string",
      desc: "Hash of the input history and this input.",
    },
    history: {
      title: "History",
      type: "array",
      pg_type: "TEXT[]",
      desc: "The previous inputs",
      render: {
        type: "json",
      },
    },
    total_time_s: {
      type: "number",
      desc: "Total amount of time the API call took in seconds.",
    },
    expire: {
      type: "timestamp",
      desc: "optional future date, when the entry will be deleted",
    },
    kernel: {
      type: "string",
    },
    tag: {
      type: "string",
      desc: "A string that the client can include that is useful for analytics later",
    },
    project_id: {
      desc: "Optional project that is used for this evaluation.",
      type: "uuid",
      render: { type: "project_link" },
    },
    path: {
      desc: "Optional path that is used for this evaluation.",
      type: "string",
    },
  },
  rules: {
    desc: "Jupyter Kernel Execution Log",
    primary_key: "id",
    pg_indexes: ["time", "hash"],
  },
});

Table({
  name: "crm_jupyter_execute_log",
  rules: {
    virtual: "jupyter_execute_log",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          time: null,
          input: null,
          history: null,
          output: null,
          kernel: null,
          account_id: null,
          tag: null,
          expire: null,
          total_time_s: null,
          analytics_cookie: null,
          project_id: null,
          path: null,
        },
      },
    },
  },
  fields: schema.jupyter_execute_log.fields,
});
