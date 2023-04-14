import { Table } from "./types";
import { CREATED_BY, ID, CREATED } from "./crm";
import { SCHEMA as schema } from "./index";

// The jupyter api log has one entry each time a computation
// actually gets performed.  Nothing is logged when a request
// is satisfied using the cache.

Table({
  name: "jupyter_api_log",
  fields: {
    id: ID,
    created: CREATED,
    analytics_cookie: {
      title: "Analytics Cookie",
      type: "string",
      desc: "The analytics cookie for the user that asked this question.",
    },
    account_id: CREATED_BY,
    hash: {
      type: "string",
      desc: "Hash of the input history, input, kernel, project_id, and path.",
    },
    total_time_s: {
      type: "number",
      desc: "Total amount of time the API call took in seconds.",
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
    kernel: {
      type: "string",
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
    input: {
      title: "Input",
      type: "string",
      desc: "Input text that was sent to kernel",
      render: {
        type: "code",
      },
    },
  },
  rules: {
    desc: "Jupyter Kernel Execution Log",
    primary_key: "id",
    pg_indexes: ["created", "hash"],
  },
});

Table({
  name: "crm_jupyter_api_log",
  rules: {
    virtual: "jupyter_api_log",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          created: null,
          hash: null,
          account_id: null,
          analytics_cookie: null,
          project_id: null,
          path: null,
          kernel: null,
          history: null,
          input: null,
          tag: null,
          total_time_s: null,
        },
      },
    },
  },
  fields: schema.jupyter_api_log.fields,
});

Table({
  name: "jupyter_api_cache",
  fields: {
    id: ID,
    hash: {
      type: "string",
      desc: "Hash of the input history, input, kernel, project_id, and path.",
    },
    created: CREATED,
    last_active: {
      type: "timestamp",
      desc: "When this cache entry was last requested",
    },
    output: {
      title: "Output",
      type: "array",
      pg_type: "JSONB[]",
      desc: "Output from running the computation",
      render: {
        type: "json",
      },
    },
  },
  rules: {
    desc: "Jupyter Kernel Execution Log",
    primary_key: "id",
    pg_indexes: ["created", "hash"],
  },
});

Table({
  name: "crm_jupyter_api_cache",
  rules: {
    virtual: "jupyter_api_cache",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          hash: null,
          created: null,
          last_active: null,
          count: null,
          output: null,
        },
      },
    },
  },
  fields: schema.jupyter_api_cache.fields,
});
