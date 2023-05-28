import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { NOTES } from "./crm";

export type Model = "gpt-3.5-turbo" | "gpt-4";

interface openaiGPT4 {
  type: "openai-gpt4";
  prompt_tokens: number;
  output_tokens: number;
}

interface openaiImage {
  type: "openai-image";
}

type Description = openaiGPT4 | openaiImage;

export interface Purchase {
  id: number;
  time: Date;
  account_id: string;
  cost: number;
  desc: Description;
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
      type: "number",
      pg_type: "numeric(10,2)",
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
    },
    desc: {
      title: "Description",
      desc: "An object that describes what was purchased.",
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
          desc: null,
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
          desc: null,
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
          cost: true,
          notes: true,
        },
      },
    },
  },
  fields: schema.purchases.fields,
});
