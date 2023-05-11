import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";

export type Model = "gpt-3.5-turbo" | "gpt-4";

export interface ChatGPTLogEntry {
  id: number;
  time: Date;
  input: string;
  output: string;
  total_tokens: number;
  total_time_s: number; // how long the request took in s
  analytics_cookie?: string; // at least one of analytics_cookie or account_id will be set
  account_id?: string;
  project_id?: string;
  path?: string;
  model?: Model;
  tag?: string; // useful for keeping track of where queries come frome when doing analytics later
  expire?: Date;
}

Table({
  name: "openai_chatgpt_log",
  fields: {
    id: ID,
    time: { type: "timestamp", desc: "When this particular chat happened." },
    analytics_cookie: {
      title: "Analytics Cookie",
      type: "string",
      desc: "The analytics cookie for the user that asked this question.",
    },
    account_id: CREATED_BY,
    system: {
      title: "System Context",
      type: "string",
      desc: "System context prompt.",
      render: {
        type: "markdown",
      },
    },
    input: {
      title: "Input",
      type: "string",
      desc: "Input text that was sent to chatgpt",
      render: {
        type: "markdown",
      },
    },
    output: {
      title: "Output",
      type: "string",
      desc: "Output text that was returned from chatgpt",
      render: {
        type: "markdown",
      },
    },
    history: {
      title: "History",
      type: "array",
      pg_type: "JSONB[]",
      desc: "Historical context for this thread of discussion",
      render: {
        type: "json",
      },
    },
    total_tokens: {
      type: "integer",
      desc: "The total number of tokens involved in this API call.",
    },
    total_time_s: {
      type: "number",
      desc: "Total amount of time the API call took in seconds.",
    },
    project_id: {
      type: "uuid",
      render: { type: "project_link" },
    },
    path: {
      type: "string",
    },
    expire: {
      type: "timestamp",
      desc: "optional future date, when the entry will be deleted",
    },
    model: {
      type: "string",
    },
    tag: {
      type: "string",
      desc: "A string that the client can include that is useful for analytics later",
    },
  },
  rules: {
    desc: "OpenAI ChatGPT Log",
    primary_key: "id",
    pg_indexes: ["account_id", "analytics_cookie", "time"],
    user_query: {
      get: {
        pg_where: [{ "account_id = $::UUID": "account_id" }],
        fields: {
          id: null,
          time: null,
          account_id: null,
          input: null,
          system: null,
          output: null,
          total_tokens: null,
          total_time_s: null,
          project_id: null,
          path: null,
          history: null,
          expire: null,
          model: null,
          tag: null,
        },
      },
      set: {
        // this is so that a user can expire any chats they wanted to have expunged from
        // the system completely.
        fields: {
          account_id: "account_id",
          id: true,
          expire: true,
        },
      },
    },
  },
});

Table({
  name: "crm_openai_chatgpt_log",
  rules: {
    virtual: "openai_chatgpt_log",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          time: null,
          account_id: null,
          analytics_cookie: null,
          input: null,
          system: null,
          output: null,
          total_tokens: null,
          total_time_s: null,
          project_id: null,
          path: null,
          history: null,
          model: null,
          tag: null,
        },
      },
    },
  },
  fields: schema.openai_chatgpt_log.fields,
});

export interface EmbeddingData {
  id: string; // fragment id, i.e., exactly what is after the # in the url
  text?: string; // test that is embedded using a model
  meta?: object; // extra metadata
  hash?: string; // hash that is used to know when we need to update the point; e.g., hash of text and meta.
}

// *technical* limit is 8K tokens, but there's no good reason for a search to be really longthere's no good reason for a search to be really long,
// and it could be costly.
export const MAX_SEARCH_TEXT = 4000;
// Limit on the number of outputs when doing a search.  This should stay under 10MB total,
// to avoid message size limits. Use paging for more, which app client automatically does.
export const MAX_SEARCH_LIMIT = 200;

// Maximum number of distinct embeddings that a single client can save at once.
// The app client itself will automatically chunk the saves at this size.
export const MAX_SAVE_LIMIT = 50;
// Similar limit on removing items; can be larger since no vector embedding computation, etc.
export const MAX_REMOVE_LIMIT = 100;

Table({
  name: "openai_embedding_log",
  fields: {
    input_sha1: {
      title: "Sha1 hash of input",
      type: "string",
      pg_type: "char(40)",
    },
    time: {
      type: "timestamp",
      desc: "When this embedding was created.",
    },
    tokens: {
      type: "integer",
      desc: "The total number of tokens of the input string.",
    },
    vector: {
      type: "array",
      pg_type: "double precision[]",
      desc: "The vector obtained from openai.",
    },
    model: {
      type: "string",
      desc: "The model that was used; if left blank it is assumed to be text-embedding-ada-002.",
    },
    expire: {
      type: "timestamp",
      desc: "future date, when the entry will be deleted.   This is useful in case we decide to automatically delete rows that haven't been recently accessed.  Some entries correspond to queries users type, so may be very frequent, or content in shared notebooks (e.g., students in class), so caching is very valuable when it is actively happening.",
    },
  },
  rules: {
    desc: "OpenAI Vector Embedding Log.  This is a log and a cache of embeddings that we computed using openai.  It helps us track costs and avoid having to recompute embeddings, which costs money and takes time.  It is only used as a CACHE by our system.  This entire table could be deleted at any time, and the only impact is that some things may be slower and we may have to pay to recompute embeddings, but nothing should *break*.",
    primary_key: "input_sha1",
    pg_indexes: ["((vector IS NOT NULL))"],
  },
});
