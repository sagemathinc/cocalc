import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { NOTES } from "./crm";

export type Status = "active" | "canceled" | "unpaid" | "past_due";
export type Interval = "month" | "year";
export interface LicenseMetadata {
  type: "license";
  license_id: string;
}
export type Metadata = LicenseMetadata;

export interface Subscription {
  id: number;
  account_id: string;
  created: Date;
  cost: number;
  interval: Interval;
  current_period_start: Date;
  current_period_end: Date;
  latest_purchase_id: number;
  status: Status;
  metadata: Metadata;
  notes?: string;
}

export const STATUS_TO_COLOR = {
  active: "green",
  blue: "red",
  unpaid: "red",
  past_due: "red",
};

Table({
  name: "subscriptions",
  fields: {
    id: ID,
    account_id: CREATED_BY,
    created: { type: "timestamp", desc: "When this subscription was created" },
    cost: {
      title: "Cost (USD $)",
      desc: "The cost in US dollars for one period of this subscription.",
      type: "number",
      pg_type: "real",
    },
    interval: {
      title: "Interval",
      type: "string",
      desc: "The length of time of one interval of the subscription: 'month', 'year'.",
    },
    current_period_start: {
      type: "timestamp",
      desc: "When current period of this subscription starts.",
    },
    current_period_end: {
      type: "timestamp",
      desc: "When current period of this subscription ends.",
    },
    latest_purchase_id: {
      type: "integer",
      desc: "id of the most recent purchase id for this subscription",
    },
    status: {
      title: "Status",
      type: "string",
      desc: "The status of the description: 'active', 'canceled', 'unpaid', 'past_due'",
    },
    metadata: {
      title: "Metadata",
      desc: "Metadata that describes what the subscription is for, e.g., {type:'license', license_id:'...'}",
      type: "map",
      pg_type: "jsonb",
    },
    notes: NOTES, // for admins to make notes about this subscription
  },
  rules: {
    desc: "Subscriptions",
    primary_key: "id",
    pg_indexes: ["account_id"],
    user_query: {
      get: {
        pg_where: [{ "account_id = $::UUID": "account_id" }],
        fields: {
          id: null,
          account_id: null,
          created: null,
          cost: null,
          interval: null,
          status: null,
          metadata: null,
        },
      },
    },
  },
});

Table({
  name: "crm_subscriptions",
  rules: {
    virtual: "subscriptions",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          account_id: null,
          created: null,
          cost: null,
          interval: null,
          status: null,
          metadata: null,
          notes: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          account_id: true,
          created: true,
          cost: true,
          interval: true,
          status: true,
          metadata: true,
          notes: true,
        },
      },
    },
  },
  fields: schema.subscriptions.fields,
});
