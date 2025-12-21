/*
Purchases

NOTES:

- cost is by definition how much the thing costs the customer, e.g., -10 means a credit of $10.
- amount is by definition the negative of cost.

We typically *show* user the amount, but we do absolutely all internal accounting
and storage with cost.  Why? Because I wrote all the code and tests that way, and it was
too late to change t use amount internally.  That's the only reason.
*/

import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import * as computeServers from "./compute-servers";
import { CREATED_BY, ID } from "./crm";
import type { MembershipClass } from "./subscriptions";
import { SCHEMA as schema } from "./index";
import { LanguageServiceCore } from "./llm-utils";
import type { CourseInfo } from "./projects";
import { Table } from "./types";
import type { LineItem } from "@cocalc/util/stripe/types";

// various specific payment purposes

// buying items in the shopping cart
export const SHOPPING_CART_CHECKOUT = "shopping-cart-checkout";

// automatic balance top up
export const AUTO_CREDIT = "auto-credit";

// paying for a class
export const STUDENT_PAY = "student-pay";

// month-to-month payment for active subscription
export const SUBSCRIPTION_RENEWAL = "subscription-renewal";

// resuming a canceled subscription that has expired:
export const RESUME_SUBSCRIPTION = "resume-subscription";

// for paying a statement the purpose is `statement-${statement_id}`
// (Maybe we should be usig metadata for this though?)



export type Reason =
  | "duplicate"
  | "fraudulent"
  | "requested_by_customer"
  | "other";

// The general categories of services we offer.  These must
// be at most 127 characters, and users can set an individual
// monthly quota on each one in purchase-quotas.
// The service names for openai are of the form "openai-[model name]"

// todo: why is this "compute"? makes no sense.
export type ComputeService =
  | "credit"
  | "auto-credit"
  | "refund"
  | "project-upgrade"
  | "compute-server"
  | "compute-server-network-usage"
  | "compute-server-storage"
  | "membership"
  | "license"
  | "voucher"
  | "edit-license";

// NOTE: we keep Codex under the openai prefix since it uses OpenAI billing.
export type CodexService = "openai-codex-agent";

export type Service = LanguageServiceCore | ComputeService | CodexService;

export interface LLMDescription {
  type: LanguageServiceCore;
  prompt_tokens: number;
  completion_tokens: number;
  amount?: number; // appears in purchses/close.ts
  last_updated?: number; // also in purchases/close.ts, a timestamp (Date.valueOf())
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

export interface ComputeServer {
  type: "compute-server";
  state: computeServers.State;
  compute_server_id: number;
  configuration: computeServers.Configuration;
}

export interface ComputeServerNetworkUsage {
  type: "compute-server-network-usage";
  cost?: number;
  compute_server_id: number;
  amount: number; // amount of data used in GB
  last_updated?: number;
}

// describes how the charges for GCS for a period time break down
// into components.  Of course there is much more detail than this
// in billing data, e.g., exactly how much of each kind of network.
// But at least this breakdown is probably helpful as a start to
// better understand charges.
export interface GoogleCloudStorageBucketCost {
  network: number;
  storage: number;
  classA: number;
  classB: number;
  autoclass: number;
  other: number;
}

// This is used to support cloud file systems; however, it's generic
// enough it could be for any bucket storage.
export interface ComputeServerStorage {
  type: "compute-server-storage";
  cloud: "google-cloud"; // only google-cloud currently supported
  bucket: string; // SUPER important -- the name of the bucket
  cloud_filesystem_id: number;
  // once the purchase is done and finalized, we put the final cost here:
  cost?: number;
  // this is a breakdown of the cost, which is cloud-specific
  cost_breakdown?: GoogleCloudStorageBucketCost;
  // filesystem the bucket is used for.
  // an estimated cost for the given period of time -- we try to make this
  // based on collected metrics, and it may or may not be close to the
  // actual cost.
  estimated_cost?: { min: number; max: number };
  // when the estimated cost was set.
  last_updated?: number;
}

export interface License {
  type: "license";
  info: PurchaseInfo;
  license_id: string;
  item?; // item in shopping cart
  course?: CourseInfo;
  // if this license was bought using credit that was added, then record the id of that transaction here.
  // it's mainly "psychological", but often money is added specifically to buy a license, and it is good
  // to keep track of that flow.
  credit_id?: number;
}

export interface Membership {
  type: "membership";
  subscription_id: number;
  class: MembershipClass;
  interval: "month" | "year";
}

export interface Voucher {
  type: "voucher";
  quantity: number;
  cost: number; // per voucher
  title: string;
  voucher_id: number;
  credit_id?: number;
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
  voucher_code?: string; // if credit is the result of redeeming a voucher code
  line_items?: LineItem[];
  description?: string;
  purpose?: string;
}

export interface AutoCredit {
  type: "auto-credit";
  line_items?: LineItem[];
  description?: string;
}

export interface Refund {
  type: "refund";
  purchase_id: number; // id of entry in purchases table of the credit that this is refunding back from
  refund_id?: string; // stripe Refund object id for the refund
  reason: Reason;
  notes: string;
}

export type Description =
  | LLMDescription
  | ProjectUpgrade
  | ComputeServer
  | ComputeServerNetworkUsage
  | ComputeServerStorage
  | Credit
  | Refund
  | License
  | Membership
  | Voucher
  | EditLicense;

// max number of purchases a user can get in one query.
export const MAX_API_LIMIT = 500;

// maximum for any single purchase ever.  Any frontend
// ui or api should use this constant to define a check.
export const MAX_COST = 99999;

export function getAmountStyle(amount: number) {
  return {
    fontWeight: "bold",
    color: amount >= 0 ? "#126bc5" : "#414042",
    whiteSpace: "nowrap",
  } as const;
}

export interface Purchase {
  id: number;
  time: Date;
  account_id: string;
  cost?: number;
  cost_per_hour?: number; // for purchases with a specific rate (e.g., an upgrade)
  cost_so_far?: number; // for purchases that accumulate (e.g., data transfer)
  period_start?: Date;
  period_end?: Date;
  pending?: boolean;
  service: Service;
  description: Description;
  invoice_id?: string;
  payment_intent_id?: string;
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
      desc: "**DEPRECATED** -- not used anywhere; do NOT use!  If true, then this transaction is considered pending, which means that for a few days it doesn't count against the user's quotas for the purposes of deciding whether or not a purchase is allowed.  This is needed so we can charge a user for their subscriptions, then collect the money from them, without all of the running pay-as-you-go project upgrades suddenly breaking (etc.).",
    },
    cost_per_hour: {
      title: "Cost Per Hour",
      desc: "The cost in US dollars per hour.  This is used to compute the cost so far for metered purchases when the cost field isn't set yet.  The cost so far is the number of hours since period_start times the cost_per_hour.  The description field may also contain redundant cost per hour information, but this cost_per_hour field is the definitive source of truth.  Once the cost field is set, this cost_per_hour is just useful for display purposes.",
      type: "number",
      pg_type: "real",
    },
    cost_so_far: {
      title: "Cost So Far",
      desc: "The cost so far in US dollars for a metered purchase that accumulates.  This is used, e.g., for data transfer charges.",
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
      title: "Stripe Invoice Id or Payment Intent Id",
      desc: "The id of the stripe invoice that was sent that included this item.  If paid via a payment intent, this will be the id of a payment intent instead, and it will start with pi_.",
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
    notes: {
      type: "string",
      desc: "Non-private notes about this purchase.  The user CAN see but not edit them.",
      render: {
        type: "markdown",
        editable: true,
      },
    },
  },
  rules: {
    desc: "Purchase Log",
    primary_key: "id",
    pg_indexes: ["account_id", "time", "project_id"],
    pg_unique_indexes: [
      // having two entries with same invoice_id or id would be very bad, since that
      // would mean user got money twice for one payment!
      // Existence of this unique index is assumed in src/packages/server/purchases/stripe/process-payment-intents.ts
      "invoice_id",
    ],
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
          cost_so_far: null,
          service: null,
          description: null,
          invoice_id: null,
          project_id: null,
          tag: null,
          notes: null,
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
          cost_so_far: null,
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
