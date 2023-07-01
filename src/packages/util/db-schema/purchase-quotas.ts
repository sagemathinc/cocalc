import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import type { Service } from "./purchases";

export type { Service };

interface Spec {
  display: string; // what to show user to describe this service
  noSet?: boolean; // if true, then no spend limits are set for this.
  color: string;
}

export type QuotaSpec = Record<Service, Spec>;

export const QUOTA_SPEC: QuotaSpec = {
  credit: { display: "Credit", noSet: true, color: "#5cb85c" },
  "openai-gpt-4": { display: "OpenAI GPT-4", color: "#10a37f" },
  "openai-gpt-3.5-turbo": {
    display: "OpenAI GPT-3.5",
    color: "#10a37f",
    noSet: true, // because this model is not charged for
  },
  "openai-gpt-3.5-turbo-16k": {
    display: "OpenAI GPT-3.5 16k",
    color: "#10a37f",
  },
  "openai-text-embedding-ada-002": {
    display: "OpenAI Text Embedding Ada 002",
    color: "#10a37f",
    noSet: true, // because this model is not user visible yet
  },
  "openai-gpt-4-32k": {
    display: "OpenAI GPT-4 32k",
    color: "#10a37f",
    noSet: true, // because this model is not user visible yet
  },
  "project-upgrade": { display: "Project Upgrade", color: "#5bc0de" },
  license: {
    display: "License",
    color: "#00008b",
    noSet:
      true /* we aren't actually using quotas for license purchases, because they are very explicit unlike openai and project-upgrade */,
  },
  "edit-license": {
    display: "Change License",
    color: "#5498fb",
    noSet: true,
  },
};

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
