/*
Purchases

NOTES:


- cost is by definition how much the thing costs the customer, e.g., -10 means a credit of $10.
- amount is by definition the negative of cost.

We typically *show* user the amount, but we do absolutely all internal accounting
and storage with cost.  Why? Because I wrote all the code and tests that way, and it was
too late to change t use amount internally.  That's the only reason.
*/

import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { NOTES } from "./crm";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import type { CourseInfo } from "./projects";

// The general categories of services we offer.  These must
// be at most 127 characters, and users can set an individual
// monthly quota on each one in purchase-quotas.
// The service names for openai are of the form "openai-[model name]"

export type Service =
  | "credit"
  | "openai-gpt-4"
  | "openai-gpt-4-32k"
  | "openai-gpt-3.5-turbo"
  | "openai-gpt-3.5-turbo-16k"
  | "openai-text-embedding-ada-002"
  | "project-upgrade"
  | "license"
  | "voucher"
  | "edit-license";

export interface OpenaiGPT4 {
  type: "openai-gpt-4";
  prompt_tokens: number;
  completion_tokens: number;
}

export interface OpenaiGPT4_32k {
  type: "openai-gpt-4-32k";
  prompt_tokens: number;
  completion_tokens: number;
}

export interface OpenaiGPT35 {
  type: "openai-gpt-3.5-turbo";
  prompt_tokens: number;
  completion_tokens: number;
}

export interface OpenaiGPT35_16k {
  type: "openai-gpt-3.5-turbo-16k";
  prompt_tokens: number;
  completion_tokens: number;
}

export interface OpenaiTextEmbeddingsAda002 {
  type: "openai-text-embedding-ada-002";
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ProjectUpgrade {
  type: "project-upgrade";
  project_id: string;
  start: number; // ms since epoch
  stop?: number; // ms since epoch
  quota: {
    cost: number; // dollars per hour
    cores?: number;
    memory?: number;
    network?: number;
    mintime?: number;
    cpu_shares?: number;
    disk_quota?: number;
    member_host?: number;
    always_running?: number;
    memory_request?: number;
  };
}

export interface License {
  type: "license";
  info: PurchaseInfo;
  license_id: string;
  item?; // item in shopping cart
  course?: CourseInfo;
}

export interface Voucher {
  type: "voucher";
  quantity: number;
  cost: number; // per voucher
  title: string;
  voucher_id: number;
}

export interface EditLicense {
  type: "edit-license";
  license_id: string;
  origInfo: PurchaseInfo;
  modifiedInfo: PurchaseInfo;
  note: string; // not explaining the cost
}

export interface Credit {
  type: "credit";
  // not sure what else, e.g., if it comes from a voucher, could be the voucher code here.
}

export type Description =
  | OpenaiGPT4
  | OpenaiGPT4_32k
  | OpenaiGPT35
  | OpenaiGPT35_16k
  | OpenaiTextEmbeddingsAda002
  | ProjectUpgrade
  | Credit
  | License
  | Voucher
  | EditLicense;

// max number of purchases a user can get in one query.
export const MAX_API_LIMIT = 500;

export function getAmountStyle(amount: number) {
  return {
    fontWeight: "bold",
    color: amount >= 0 ? "#126bc5" : "#414042",
  } as const;
}

export interface Purchase {
  id: number;
  time: Date;
  account_id: string;
  cost?: number;
  cost_per_hour?: number;
  period_start?: Date;
  period_end?: Date;
  pending?: boolean;
  service: Service;
  description: Description;
  invoice_id?: string;
  project_id?: string;
  tag?: string;
  day_statement_id?: number;
  month_statement_id?: number;
  notes?: string;
}

Table({
  name: "purchases",
  fields: {
    id: ID,
    time: { type: "timestamp", desc: "When this purchase was logged." },
    account_id: CREATED_BY,
    cost: {
      title: "Cost ($)",
      desc: "The cost in US dollars. Not set if the purchase isn't finished, e.g., when upgrading a project this is only set when project stops or purchase is finalized. This takes precedence over the cost_per_hour times the length of the period when active.",
      type: "number",
      pg_type: "real",
    },
    pending: {
      type: "boolean",
      desc: "If true, then this transaction is considered pending, which means that for a few days it doesn't count against the user's quotas for the purposes of deciding whether or not a purchase is allowed.  This is needed so we can charge a user for their subscriptions, then collect the money from them, without all of the running pay-as-you-go project upgrades suddenly breaking (etc.).",
    },
    cost_per_hour: {
      title: "Cost ($)",
      desc: "The cost in US dollars per hour.  This is used to compute the cost so far for metered purchases when the cost field isn't set yet.  The cost so far is the number of hours since period_start times the cost_per_hour.  The description field may also contain redundant cost per hour information, but this cost_per_hour field is the definitive source of truth.  Once the cost field is set, this cost_per_hour is just useful for display purposes.",
      type: "number",
      pg_type: "real",
    },
    period_start: {
      title: "Period Start",
      type: "timestamp",
      desc: "When the purchase starts being active (e.g., a 1 week license starts and ends on specific days; for metered purchases it is when the purchased started charging)",
    },
    period_end: {
      title: "Period End",
      type: "timestamp",
      desc: "When the purchase stops being active.  For metered purchases, it's when the purchase finished being charged, in which case the cost field should be equal to the length of the period times the cost_per_hour.",
    },
    invoice_id: {
      title: "Invoice Id",
      desc: "The id of the stripe invoice that was sent that included this item.  Legacy: if paid via a payment intent, this will be the id of a payment intent instead, and it will start with pi_.",
      type: "string",
    },
    project_id: {
      title: "Project Id",
      desc: "The id of the project where this purchase happened.  Not all purchases necessarily involve a project.",
      type: "uuid",
      render: { type: "project_link" },
    },
    service: {
      title: "Service Category",
      desc: "The service being charged for, e.g., openai-gpt-4, etc.",
      type: "string",
      pg_type: "varchar(127)",
    },
    description: {
      title: "Description",
      desc: "An object that provides additional details about what was purchased and can have an arbitrary format.  This is mainly used to provide extra insight when rendering this purchase for users, and its content should not be relied on for queries.",
      type: "map",
      pg_type: "jsonb",
    },
    tag: {
      type: "string",
      pg_type: "varchar(127)",
      desc: "Optional string that can be useful in analytics to understand where and how this purchase was made.",
    },
    day_statement_id: {
      type: "integer",
      desc: "id of the daily statement that includes this purchase",
    },
    month_statement_id: {
      type: "integer",
      desc: "id of the monthly statement that includes this purchase",
    },
    notes: NOTES, // for admins to make notes about this purchase
  },
  rules: {
    desc: "Purchase Log",
    primary_key: "id",
    pg_indexes: ["account_id", "time", "project_id"],
    user_query: {
      get: {
        pg_where: [{ "account_id = $::UUID": "account_id" }],
        fields: {
          id: null,
          time: null,
          period_start: null,
          period_end: null,
          account_id: null,
          cost: null,
          pending: null,
          cost_per_hour: null,
          service: null,
          description: null,
          invoice_id: null,
          project_id: null,
          tag: null,
        },
      },
    },
  },
});

Table({
  name: "crm_purchases",
  rules: {
    virtual: "purchases",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          time: null,
          period_start: null,
          period_end: null,
          account_id: null,
          cost: null,
          pending: null,
          cost_per_hour: null,
          service: null,
          description: null,
          invoice_id: null,
          project_id: null,
          tag: null,
          notes: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          tag: true,
          notes: true,
        },
      },
    },
  },
  fields: schema.purchases.fields,
});
