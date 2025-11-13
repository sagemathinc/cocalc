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

export const RENEW_DAYS_BEFORE_END = 5;

export interface SubscriptionPayment {
  // id of the payment intent in stripe
  payment_intent_id: string;
  // the cost of the subscription renewal; this is usually the same as the cost of the subscription,
  // but could be different, e.g,. if part of the renewal is paid from the user's balance.
  amount: number;
  // timestamp in ms since epoch of when this payment was created.
  created: number;
  // status of this payment: "active" --> "paid" or "active" --> "canceled"
  status: "active" | "paid" | "canceled";
  // when this payment gets paid, we change the expire date on the
  // license to this (which is stored in ms since epoch):
  new_expires_ms: number;
}

export interface Subscription {
  id: number;
  account_id: string;
  created: Date;
  cost: number;
  interval: Interval;
  current_period_start: Date;
  current_period_end: Date;
  latest_purchase_id?: number;
  status: Status;
  canceled_at?: Date;
  canceled_reason?: string;
  resumed_at?: Date;
  metadata: Metadata;
  renewal_email?: Date;
  notes?: string;
  cost_per_hour?: number;
  payment?: SubscriptionPayment;
  // if resuming this is the payment intent
  resume_payment_intent?: string;
}

export const STATUS_TO_COLOR = {
  active: "blue",
  canceled: "grey",
  paid: "green",
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
    canceled_at: {
      type: "timestamp",
      desc: "When subscription was canceled",
    },
    canceled_reason: {
      type: "string",
      desc: "Why subscription was canceled",
    },
    resumed_at: {
      type: "timestamp",
      desc: "When subscription was resumed",
    },
    metadata: {
      title: "Metadata",
      // the ONLY type of subscriptions we have are for upgrade licenses:
      desc: "Metadata that describes what the subscription is for, e.g., {type:'license', license_id:'...'}",
      type: "map",
      pg_type: "jsonb",
    },
    renewal_email: {
      type: "timestamp",
      desc: "Timestamp when we last sent a reminder that this subscription will renew soon.",
    },
    notes: NOTES, // for admins to make notes about this subscription
    payment: {
      type: "map",
      desc: "Data about the most recent payment intent for a subscription. The type is SubscriptionPayment (see typescript above).",
    },
    resume_payment_intent: {
      type: "string",
      desc: "When resuming a canceled subscription and paying, this is the payment intent.  This is used to prevent any possibility of double payment.",
    },
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
          canceled_at: null,
          resumed_at: null,
          metadata: null,
          current_period_start: null,
          current_period_end: null,
          latest_purchase_id: null,
          renewal_email: null,
          payment: null,
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
          current_period_start: null,
          current_period_end: null,
          latest_purchase_id: null,
          cost: null,
          interval: null,
          status: null,
          canceled_at: null,
          resumed_at: null,
          metadata: null,
          renewal_email: null,
          notes: null,
          payment: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          account_id: true,
          created: true,
          current_period_start: true,
          current_period_end: true,
          latest_purchase_id: true,
          cost: true,
          interval: true,
          status: true,
          canceled_at: true,
          resumed_at: true,
          metadata: true,
          notes: true,
        },
      },
    },
  },
  fields: schema.subscriptions.fields,
});
