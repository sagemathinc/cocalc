// NOTE: this is not just OpenAI, but also includes other models that we use
// Mentally, just ignore "openai" and instead focus on "gpt-*" or "codey" or whatever they are called.
// TODO: refactor this, the names of the tables, etc. to be more generic.

import { unreachable } from "../misc";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { Table } from "./types";

export const LANGUAGE_MODELS = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-4",
  "gpt-4-32k",
  // google's are taken from here – we use the generative AI client lib
  // https://developers.generativeai.google/models/language
  "text-bison-001",
  "chat-bison-001",
  "embedding-gecko-001",
] as const;

export const USER_SELECTABLE_LANGUAGE_MODELS: Readonly<LanguageModel[]> = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-4",
  "chat-bison-001",
] as const;

export type LanguageModel = (typeof LANGUAGE_MODELS)[number];

export function getValidLanguageModelName(
  model: string | undefined,
  filter: { google: boolean; openai: boolean } = { google: true, openai: true },
): LanguageModel {
  const dftl = filter.openai === true ? DEFAULT_MODEL : "chat-bison-001";
  if (model == null) {
    return dftl;
  }
  if (!LANGUAGE_MODELS.includes(model as LanguageModel)) {
    return dftl;
  }
  return model as LanguageModel;
}

export type LanguageService =
  | "openai-gpt-3.5-turbo"
  | "openai-gpt-3.5-turbo-16k"
  | "openai-gpt-4"
  | "openai-gpt-4-32k"
  | "google-text-bison-001"
  | "google-chat-bison-001"
  | "google-embedding-gecko-001";

export function model2service(model: LanguageModel): LanguageService {
  if (
    model === "text-bison-001" ||
    model === "chat-bison-001" ||
    model === "embedding-gecko-001"
  ) {
    return `google-${model}`;
  } else {
    return `openai-${model}`;
  }
}

// Note: this must be an OpenAI model – otherwise change the getValidLanguageModelName function
export const DEFAULT_MODEL: LanguageModel = "gpt-3.5-turbo";

export type Vendor = "openai" | "google";

export function model2vendor(model: LanguageModel): Vendor {
  if (model.startsWith("gpt-")) {
    return "openai";
  } else {
    return "google";
  }
}

export const MODELS = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-4",
  "gpt-4-32k",
  "text-embedding-ada-002",
  "text-bison-001",
  "chat-bison-001",
  "embedding-gecko-001",
] as const;

export type Model = (typeof MODELS)[number];

// Map from psuedo account_id to what should be displayed to user.
// This is used in various places in the frontend.
// Google PaLM: https://cloud.google.com/vertex-ai/docs/generative-ai/pricing
export const LLM_USERNAMES = {
  chatgpt: "GPT-3.5",
  chatgpt3: "GPT-3.5",
  chatgpt4: "GPT-4",
  "gpt-4": "GPT-4",
  "gpt-4-32k": "GPT-4-32k",
  "gpt-3.5-turbo": "GPT-3.5",
  "gpt-3.5-turbo-16k": "GPT-3.5-16k",
  "text-bison-001": "PaLM 2",
  "chat-bison-001": "PaLM 2",
  "embedding-gecko-001": "PaLM 2",
} as const;

export function isFreeModel(model: Model) {
  return (
    model == "gpt-3.5-turbo" ||
    model == "text-bison-001" ||
    model == "chat-bison-001" ||
    model == "embedding-gecko-001"
  );
}

export function getVendorStatusCheck(vendor: Vendor) {
  switch (vendor) {
    case "openai":
      return `OpenAI [status](https://status.openai.com) and [downdetector](https://downdetector.com/status/openai).`;
    case "google":
      return `Google [status](https://status.cloud.google.com) and [downdetector](https://downdetector.com/status/google-cloud).`;
    default:
      unreachable(vendor);
  }
}

interface Cost {
  prompt_tokens: number;
  completion_tokens: number;
  max_tokens: number;
}

// This is the official published cost that openai charges.
// It changes over time, so this will sometimes need to be updated.
// Our cost is a configurable multiple of this.
// https://openai.com/pricing#language-models
// There appears to be no api that provides the prices, unfortunately.
export const OPENAI_COST: { [name in string]: Cost } = {
  "gpt-4": {
    prompt_tokens: 0.03 / 1000,
    completion_tokens: 0.06 / 1000,
    max_tokens: 8192,
  },
  "gpt-4-32k": {
    prompt_tokens: 0.06 / 1000,
    completion_tokens: 0.12 / 1000,
    max_tokens: 32768,
  },
  "gpt-3.5-turbo": {
    prompt_tokens: 0.0015 / 1000,
    completion_tokens: 0.002 / 1000,
    max_tokens: 4096,
  },
  "gpt-3.5-turbo-16k": {
    prompt_tokens: 0.003 / 1000,
    completion_tokens: 0.004 / 1000,
    max_tokens: 16384,
  },
  "text-embedding-ada-002": {
    prompt_tokens: 0.0001 / 1000,
    completion_tokens: 0.0001 / 1000, // NOTE: this isn't a thing with embeddings
    max_tokens: 8191,
  },
  // https://developers.generativeai.google/models/language
  "text-bison-001": {
    // we assume 5 characters is 1 token on average
    prompt_tokens: (5 * 0.0005) / 1000,
    completion_tokens: (5 * 0.0005) / 1000,
    max_tokens: 8196,
  },
  "chat-bison-001": {
    // we assume 5 characters is 1 token on average
    prompt_tokens: (5 * 0.0005) / 1000,
    completion_tokens: (5 * 0.0005) / 1000,
    max_tokens: 8196,
  },
  "embedding-gecko-001": {
    prompt_tokens: (5 * 0.0001) / 1000,
    completion_tokens: 0,
    max_tokens: 8196, // ???
  },
} as const;

export function isValidModel(model?: Model) {
  return OPENAI_COST[model ?? ""] != null;
}

export function getMaxTokens(model?: Model): number {
  return OPENAI_COST[model ?? ""]?.max_tokens ?? 4096;
}

export interface OpenaiCost {
  prompt_tokens: number;
  completion_tokens: number;
}

export function getCost(
  model: Model,
  markup_percentage: number, // a number like "30" would mean that we increase the wholesale price by multiplying by 1.3
): OpenaiCost {
  const x = OPENAI_COST[model];
  if (x == null) {
    throw Error(`unknown model "${model}"`);
  }
  const { prompt_tokens, completion_tokens } = x;
  if (markup_percentage < 0) {
    throw Error("markup percentage can't be negative");
  }
  const f = 1 + markup_percentage / 100;
  return {
    prompt_tokens: prompt_tokens * f,
    completion_tokens: completion_tokens * f,
  };
}

// The maximum cost for one single call using the given model.
// We can't know the cost until after it happens, so this bound is useful for
// ensuring user can afford to make a call.
export function getMaxCost(model: Model, markup_percentage: number): number {
  const { prompt_tokens, completion_tokens } = getCost(
    model,
    markup_percentage,
  );
  const { max_tokens } = OPENAI_COST[model];
  return Math.max(prompt_tokens, completion_tokens) * max_tokens;
}

export interface ChatGPTLogEntry {
  id: number;
  time: Date;
  input: string;
  output: string;
  total_tokens: number;
  prompt_tokens: number;
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
// See https://platform.openai.com/docs/guides/embeddings/what-are-embeddings
export const MAX_EMBEDDINGS_TOKENS = 8191;

Table({
  name: "openai_embedding_log",
  fields: {
    id: ID,
    time: { type: "timestamp", desc: "When this particular chat happened." },
    account_id: CREATED_BY,
    tokens: {
      type: "integer",
      desc: "The total number of tokens of the input.",
    },
    model: {
      type: "string",
      desc: "The model that was used; if left blank it is assumed to be text-embedding-ada-002.",
    },
  },
  rules: {
    desc: "OpenAI Vector Embedding Log.  This logs who is responsible for calls to openai.  It is used to avoid abuse, have good analytics, and may eventually be used for pay-as-you-go, etc.",
    primary_key: "id",
    pg_indexes: ["((tokens IS NOT NULL))"],
  },
});

Table({
  name: "openai_embedding_cache",
  fields: {
    input_sha1: {
      title: "Sha1 hash of input",
      type: "string",
      pg_type: "char(40)",
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
      desc: "Date when the cache entry will be deleted.  Some entries correspond to queries users type, so may be very frequent, or content in shared notebooks (e.g., students in class), so caching is very valuable when it is actively happening.  Others don't get accessed, so we free up the space.",
    },
  },
  rules: {
    desc: "OpenAI Vector Embedding Cache.  This is a cache of embeddings that we computed using openai.  It helps us avoid having to recompute embeddings, which costs money and takes time.  It is only used as a CACHE by our system.  This entire table could be deleted at any time, and the only impact is that some things may be slower and we may have to pay to recompute embeddings, but nothing should *break*.",
    primary_key: "input_sha1",
    pg_indexes: ["((vector IS NOT NULL))"],
  },
});
