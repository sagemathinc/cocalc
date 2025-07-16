import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { LLM_USERNAMES } from "./llm-utils";
import type { Service } from "./purchases";
import { Table } from "./types";

export type { Service };

// Users will set their spend limits for these broad categories.
// TODO: right now there is a separate limit for each quota spec,
// which has got ridiculous.
const SERVICE_CATEGORIES = ["money", "compute", "license", "ai"];
type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export interface Spec {
  display: string; // what to show user to describe this service
  noSet?: boolean; // if true, then no spend limits are set for this.
  color: string;
  category: ServiceCategory;
  // tooltip more detailed description
  description?: string;
}

export type QuotaSpec = Record<Service, Spec>;

// for each category of service, this says whether or not it is a pay as you go service,
// which can impact how spend options are determined.
const IS_PAYG: { [name: ServiceCategory]: boolean } = {
  money: false,
  compute: true,
  license: false,
  ai: true,
} as const;

export function isPaygService(service: Service): boolean {
  const category = QUOTA_SPEC[service]?.category;
  return IS_PAYG[category ?? ""] ?? false;
}

const GPT_TURBO_128k: Spec = {
  display: "OpenAI GPT-4 Turbo 128k",
  color: "#10a37f",
  category: "ai",
} as const;

const GPT_TURBO_8K: Spec = {
  ...GPT_TURBO_128k,
  display: "OpenAI GPT-4 Turbo",
} as const;

const GPT_OMNI_128k: Spec = {
  display: "OpenAI GPT-4o 128k",
  color: "#10a37f",
  category: "ai",
} as const;

const GPT_OMNI_8K: Spec = {
  ...GPT_OMNI_128k,
  display: "OpenAI GPT-4o",
} as const;

const GPT_OMNI_MINI_128k: Spec = {
  ...GPT_OMNI_128k,
  display: "OpenAI GPT-4o Mini 128k",
} as const;

const GPT_OMNI_MINI_8K: Spec = {
  ...GPT_OMNI_MINI_128k,
  display: "OpenAI GPT-4o Mini",
} as const;

const GPT_41_8K: Spec = {
  display: "OpenAI GPT-4.1",
  color: "#10a37f",
  category: "ai",
} as const;

const GPT_41_MINI_8K: Spec = {
  ...GPT_41_8K,
  display: "OpenAI GPT-4.1 Mini",
} as const;

const GPT_O1_8K: Spec = {
  ...GPT_OMNI_128k,
  display: "OpenAI o1",
} as const;

const GPT_O1_MINI_8K: Spec = {
  ...GPT_O1_8K,
  display: "OpenAI o1 mini",
} as const;

const GOOGLE_AI_COLOR = "#ff4d4f";

// NOTE: all-quotas-config.tsx will automatically filter out those, which are free or not selectable by the user
export const QUOTA_SPEC: QuotaSpec = {
  credit: {
    display: "Credit",
    noSet: true,
    color: "green",
    category: "money",
    description:
      "Credit that was added to your account as a result of a manual or subscription payment (e.g., from a credit card)",
  },
  "auto-credit": {
    display: "Automatic Credit",
    noSet: true,
    color: "green",
    category: "money",
    description:
      "Credited that was automatically added to your account as a result of a payment because of your balance became low.",
  },
  refund: {
    display: "Refund",
    noSet: true,
    color: "red",
    category: "money",
    description:
      "Money that was refunded to your account as a result of a support request.",
  },
  "compute-server": {
    display: "Compute Server",
    color: "#2196f3",
    category: "compute",
    description: "Charge for creating or using a compute server.",
  },
  "compute-server-network-usage": {
    display: "Network Data",
    color: "#2196f3",
    category: "compute",
    description: "Charge due to network traffic out of a compute server.",
  },
  "compute-server-storage": {
    display: "Cloud Storage",
    color: "#fbbd05",
    category: "compute",
    description: "Charge due to storage of data on a cloud filesystem.",
  },
  license: {
    display: "License",
    color: "cyan",
    noSet: true,
    category: "license",
    description: "Purchase of a license from the store.",
  },
  "edit-license": {
    display: "Edit License",
    color: "gold",
    noSet: true,
    category: "license",
    description:
      "Charge or credit resulting from changing a license, which includes you manually editing the license, or the license being edited to extend the validity date on subscription renewal.",
  },
  voucher: {
    display: "Voucher",
    color: "#00238b",
    noSet: true,
    category: "money",
    description: "Charge for purchasing a voucher.",
  },
  // ATTN: LLMs comes below this line, the quotas above are the important ones to show first!
  "openai-gpt-4": { display: "OpenAI GPT-4", color: "#10a37f", category: "ai" },
  "openai-gpt-3.5-turbo": {
    display: "OpenAI GPT-3.5",
    color: "#10a37f",
    category: "ai",
  },
  "openai-gpt-3.5-turbo-16k": {
    display: "OpenAI GPT-3.5 16k",
    color: "#10a37f",
    category: "ai",
  },
  "openai-text-embedding-ada-002": {
    display: "OpenAI Text Embedding Ada 002",
    color: "#10a37f",
    noSet: true, // because this model is not user visible yet
    category: "ai",
  },
  "openai-gpt-4-32k": {
    display: "OpenAI GPT-4 32k",
    color: "#10a37f",
    category: "ai",
  },
  "openai-gpt-4-turbo-preview": GPT_TURBO_128k, // the "preview" is over
  "openai-gpt-4-turbo-preview-8k": GPT_TURBO_8K, // the "preview" is over
  "openai-gpt-4-turbo": GPT_TURBO_128k,
  "openai-gpt-4-turbo-8k": GPT_TURBO_8K,
  "openai-gpt-4o": GPT_OMNI_128k,
  "openai-gpt-4o-8k": GPT_OMNI_8K,
  "openai-gpt-4o-mini": GPT_OMNI_MINI_128k,
  "openai-gpt-4o-mini-8k": GPT_OMNI_MINI_8K,
  "openai-gpt-4.1": GPT_41_8K,
  "openai-gpt-4.1-mini": GPT_41_MINI_8K,
  "openai-o1-mini-8k": GPT_O1_8K,
  "openai-o1-8k": GPT_O1_MINI_8K,
  "openai-o1-mini": GPT_O1_8K,
  "openai-o1": GPT_O1_MINI_8K,
  "google-text-bison-001": {
    display: "Google Palm 2 (Text)",
    color: GOOGLE_AI_COLOR,
    noSet: true, // deprecated, will be removed
    category: "ai",
  },
  "google-chat-bison-001": {
    display: "Google Palm 2 (Chat)",
    color: GOOGLE_AI_COLOR,
    noSet: true, // deprecated, will be removed
    category: "ai",
  },
  "google-embedding-gecko-001": {
    display: "Google Gecko (Embedding)",
    color: GOOGLE_AI_COLOR,
    noSet: true, // deprecated, will be removed
    category: "ai",
  },
  "google-gemini-1.5-flash-8k": {
    display: "Google Gemini 1.5 Flash",
    color: GOOGLE_AI_COLOR,
    category: "ai",
  },
  "google-gemini-pro": {
    display: "Google Gemini 1.0 Pro",
    color: GOOGLE_AI_COLOR,
    category: "ai",
  },
  "google-gemini-1.0-ultra": {
    display: "Google Gemini 1.0 Ultra",
    color: GOOGLE_AI_COLOR,
    category: "ai",
  },
  "google-gemini-1.5-pro-8k": {
    display: LLM_USERNAMES["gemini-1.5-pro-8k"],
    color: GOOGLE_AI_COLOR,
    category: "ai",
  },
  "google-gemini-1.5-pro": {
    display: LLM_USERNAMES["gemini-1.5-pro"],
    color: GOOGLE_AI_COLOR,
    category: "ai",
  },
  "google-gemini-2.0-flash-8k": {
    display: LLM_USERNAMES["gemini-2.0-flash-8k"],
    color: GOOGLE_AI_COLOR,
    category: "ai",
  },
  "google-gemini-2.0-flash-lite-8k": {
    display: LLM_USERNAMES["gemini-2.0-flash-lite-8k"],
    color: GOOGLE_AI_COLOR,
    category: "ai",
  },
  "google-gemini-2.5-flash-8k": {
    display: LLM_USERNAMES["gemini-2.5-flash-8k"],
    color: GOOGLE_AI_COLOR,
    category: "ai",
  },
  "google-gemini-2.5-pro-8k": {
    display: LLM_USERNAMES["gemini-2.5-pro-8k"],
    color: GOOGLE_AI_COLOR,
    category: "ai",
  },
  "anthropic-claude-3-opus": {
    display: LLM_USERNAMES["claude-3-opus"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-3-opus-8k": {
    display: LLM_USERNAMES["claude-3-opus-8k"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-3-sonnet": {
    display: LLM_USERNAMES["claude-3-sonnet"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-3-sonnet-4k": {
    display: LLM_USERNAMES["claude-3-sonnet-4k"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-3-5-sonnet": {
    display: LLM_USERNAMES["claude-3-5-sonnet"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-3-5-sonnet-4k": {
    display: LLM_USERNAMES["claude-3-5-sonnet-4k"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-3-haiku": {
    display: LLM_USERNAMES["claude-3-haiku"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-3-haiku-8k": {
    display: LLM_USERNAMES["claude-3-haiku-8k"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-3-5-haiku-8k": {
    display: LLM_USERNAMES["claude-3-5-haiku-8k"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-3-7-sonnet-4k": {
    display: LLM_USERNAMES["claude-3-7-sonnet-4k"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-4-sonnet-8k": {
    display: LLM_USERNAMES["claude-4-sonnet-8k"],
    color: "#181818",
    category: "ai",
  },
  "anthropic-claude-4-opus-8k": {
    display: LLM_USERNAMES["claude-4-opus-8k"],
    color: "#181818",
    category: "ai",
  },
  "mistralai-mistral-small-latest": {
    display: LLM_USERNAMES["mistral-small-latest"],
    color: "#ff7000", // the orange from their website
    category: "ai",
  },
  "mistralai-mistral-medium-latest": {
    display: LLM_USERNAMES["mistral-medium-latest"],
    color: "#ff7000", // the orange from their website
    category: "ai",
  },
  "mistralai-mistral-large-latest": {
    display: LLM_USERNAMES["mistral-large-latest"],
    color: "#ff7000", // the orange from their website
    category: "ai",
  },
  "project-upgrade": {
    display: "Project Upgrade",
    color: "#5bc0de",
    category: "compute",
    description:
      "Charge resulting from using pay as you go upgrades to a project.",
  },
} as const;

// For pay-as-you-go project quota upgrades
export interface ProjectQuota {
  cost?: number; // dollars per hour
  enabled?: number;
  cores?: number;
  disk_quota?: number;
  memory?: number;
  mintime?: number;
  network?: number;
  member_host?: number;
  always_running?: number;
}

export const PROJECT_QUOTA_KEYS = new Set<string>([
  "enabled",
  "cost",
  "cores",
  "disk_quota",
  "memory",
  "mintime",
  "network",
  "member_host",
  "always_running",
]);

export function serviceToDisplay(service: Service): string {
  return QUOTA_SPEC[service]?.display ?? service;
}

Table({
  name: "purchase_quotas",
  fields: {
    id: ID,
    account_id: CREATED_BY,
    service: {
      title: "Service Category",
      desc: "The service being charged for, e.g., openai-gpt-4, project-upgrade, etc.",
      type: "string",
      pg_type: "varchar(127)",
    },
    value: {
      title: "Value",
      desc: "The maximum amount that user can be charged for this service during one month billing period, in US dollars.",
      type: "number", // actually comes back as string in queries.
      pg_type: "REAL",
    },
  },
  rules: {
    desc: "Purchase Quotas",
    primary_key: "id",
    // make it fast to find all quotas for a given account
    pg_indexes: ["account_id"],
    // enforce that there is only one quota for each service for a given account
    pg_unique_indexes: ["(account_id,service)"],
    user_query: {
      // set happens though v2 api only to enforce global quota
      get: {
        pg_where: [{ "account_id = $::UUID": "account_id" }],
        fields: {
          id: null,
          account_id: null,
          service: null,
          value: null,
        },
      },
    },
  },
});

Table({
  name: "crm_purchase_quotas",
  rules: {
    virtual: "purchase_quotas",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          account_id: null,
          service: null,
          value: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          account_id: true,
          service: true,
          value: true,
        },
      },
    },
  },
  fields: schema.purchase_quotas.fields,
});
