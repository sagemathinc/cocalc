import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";

import type { Service } from "./purchases";

export const QUOTA_SPEC: { [name: Service]: { display: string } } = {
  "openai-gpt4": { display: "OpenAI GPT-4" },
  "project-upgrades": { display: "Project Upgrades" },
};

// export function quotaDisplayNames(): string[] {
//   const v: string[] = [];
//   for (const name in QUOTA_NAMES) {
//     v.push(QUOTA_NAMES[name].display);
//   }
//   return v;
// }

Table({
  name: "purchase_quotas",
  fields: {
    id: ID,
    account_id: CREATED_BY,
    service: {
      title: "Service Category",
      desc: "The service being charged for, e.g., openai-gpt4, project-upgrades, etc.",
      type: "string",
      pg_type: "varchar(127)",
    },
    value: {
      title: "Value",
      desc: "The maximum amount that user can be charged for [name] during one month billing period, in US dollars.",
      type: "number", // actually comes back as string in queries.
      pg_type: "REAL CHECK (value >= 0)",
    },
  },
  rules: {
    desc: "Purchase Quotas",
    primary_key: "id",
    // make it fast to find all quotas for a given account
    pg_indexes: ["account_id"],
    // enforce that there is only one quota for each name for a given account
    pg_unique_indexes: ["(account_id,name)"],
    user_query: {
      get: {
        pg_where: [{ "account_id = $::UUID": "account_id" }],
        fields: {
          id: null,
          account_id: null,
          name: null,
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
          name: null,
          value: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          value: true,
        },
      },
    },
  },
  fields: schema.purchase_quotas.fields,
});
