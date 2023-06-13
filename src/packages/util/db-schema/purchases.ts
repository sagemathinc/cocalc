import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { NOTES } from "./crm";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";

// The general categories of services we offer.  These must
// be at most 127 characters, and users can set an individual
// monthly quota on each one in purchase-quotas:

export type Service = "credit" | "openai-gpt-4" | "project-upgrade" | "license";

export type Model = "gpt-3.5-turbo" | "gpt-4";

export interface OpenaiGPT4 {
  type: "openai-gpt-4";
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ProjectUpgrade {
  type: "project-upgrade";
  project_id: string;
  start: Date;
  stop?: Date;
  upgrade: {
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
}

// not used yet.
//export interface OpenaiImage {
//  type: "openai-image";
//}

export interface Credit {
  type: "credit";
  // not sure what else, e.g., if it comes from a voucher, could be the voucher code here.
}

export type Description = OpenaiGPT4 | ProjectUpgrade | Credit | License;

// max number of purchases a user can get in one query.
export const MAX_API_LIMIT = 500;

export interface Purchase {
  id: number;
  time: Date;
  account_id: string;
  cost: number;
  service: Service;
  description: Description;
  invoice_id?: string;
  project_id?: string;
  tag?: string;
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
      desc: "The cost in US dollars.",
      type: "number", // actually comes back as string in queries.
      pg_type: "real",
    },
    invoice_id: {
      title: "Invoice Id",
      desc: "The id of the stripe invoice that was sent that included this item.",
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
          account_id: null,
          cost: null,
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
          account_id: null,
          cost: null,
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
          cost: true,
          service: null,
          description: true,
          tag: true,
          notes: true,
          invoice_id: true,
        },
      },
    },
  },
  fields: schema.purchases.fields,
});
