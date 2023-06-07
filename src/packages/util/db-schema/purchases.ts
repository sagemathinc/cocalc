import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { NOTES } from "./crm";

// The general categories of services we offer.  These must
// be at most 127 characters, and users can set an individual
// monthly quota on each one in purchase-quotas:

export type Service =
  | "openai-gpt4"
  | "openai-image"
  | "credit"
  | "project-upgrades";

export type Model = "gpt-3.5-turbo" | "gpt-4";

export interface OpenaiGPT4 {
  type: "openai-gpt4";
  prompt_tokens: number;
  completion_tokens: number;
}

// not used yet.
export interface OpenaiImage {
  type: "openai-image";
}

export interface Credit {
  type: "credit";
  // not sure what else, e.g., if it comes from a voucher, could be the voucher code here.
}

export type Description = OpenaiGPT4 | OpenaiImage | Credit;

export interface Purchase {
  id: number;
  time: Date;
  account_id: string;
  cost: number;
  service: Service;
  description: Description;
  invoice_id?: string;
  paid?: boolean;
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
    paid: {
      title: "Paid",
      desc: "Whether or not this purchase has been successfully paid for. This gets marked true once the corresponding invoice is created and paid.",
      type: "boolean",
    },
    project_id: {
      title: "Project Id",
      desc: "The id of the project where this purchase happened.  Not all purchases necessarily involve a project.",
      type: "uuid",
      render: { type: "project_link" },
    },
    service: {
      title: "Service Category",
      desc: "The service being charged for, e.g., openai-gpt4, project-upgrades, etc.",
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
          description: null,
          invoice_id: null,
          paid: null,
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
          description: null,
          invoice_id: null,
          paid: null,
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
          description: true,
          tag: true,
          notes: true,
          paid: true,
          invoice_id: true,
        },
      },
    },
  },
  fields: schema.purchases.fields,
});
