// NOTE: this is not just OpenAI, but also includes other models that we use
// Mentally, just ignore "openai" and instead focus on "gpt-*" or "codey" or whatever they are called.
// TODO: refactor this, the names of the tables, etc. to be more generic.

import { History } from "@cocalc/util/types/llm";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { LanguageModel } from "./llm-utils";
import { Table } from "./types";

export interface LLMLogEntry {
  id: number;
  account_id?: string;
  analytics_cookie?: string; // at least one of analytics_cookie or account_id will be set
  expire?: Date;
  history?: History;
  input: string;
  model?: LanguageModel;
  output: string;
  path?: string;
  project_id?: string;
  prompt_tokens: number;
  system?: string;
  tag?: string; // useful for keeping track of where queries come frome when doing analytics later
  time: Date;
  total_time_s: number; // how long the request took in s
  total_tokens: number;
  usage_units?: number;
}

Table({
  name: "openai_chatgpt_log", // historically a wrong name, don't change it
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
    usage_units: {
      type: "integer",
      desc: "Normalized usage units for this API call.",
    },
    prompt_tokens: {
      type: "integer",
      desc: "The number of tokens in the prompt.",
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
    desc: "Language Model Log",
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
          usage_units: null,
          prompt_tokens: null,
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
          usage_units: null,
          prompt_tokens: null,
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
