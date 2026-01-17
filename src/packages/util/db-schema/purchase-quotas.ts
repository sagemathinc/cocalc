import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import type { Service } from "./purchases";
import { Table } from "./types";
import type { MoneyValue } from "@cocalc/util/money";

export type { Service };

// Users will set their spend limits for these broad categories.
// TODO: right now there is a separate limit for each quota spec,
// which has got ridiculous.
const SERVICE_CATEGORIES = ["money", "license"];
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
  license: false,
} as const;

export function isPaygService(service: Service): boolean {
  const category = QUOTA_SPEC[service]?.category;
  return IS_PAYG[category ?? ""] ?? false;
}

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
  membership: {
    display: "Membership",
    color: "cyan",
    noSet: true,
    category: "license",
    description: "Charge for a membership subscription.",
  },
  "student-pay": {
    display: "Course Fee",
    color: "cyan",
    noSet: true,
    category: "money",
    description: "Charge for a course fee paid by a student.",
  },
  voucher: {
    display: "Voucher",
    color: "#00238b",
    noSet: true,
    category: "money",
    description: "Charge for purchasing a voucher.",
  },
} as const;

// Legacy project quota upgrades (deprecated)
export interface ProjectQuota {
  cost?: MoneyValue; // dollars per hour
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
      desc: "The service being charged for, e.g., membership, voucher, etc.",
      type: "string",
      pg_type: "varchar(127)",
    },
    value: {
      title: "Value",
      desc: "The maximum amount that user can be charged for this service during one month billing period, in US dollars.",
      type: "number", // actually comes back as string in queries.
      pg_type: "numeric(20,10)",
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
