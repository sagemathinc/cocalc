/*
 *  Membership tiers configuration.
 */

import {
  Table,
  MembershipTierGetFields,
  MembershipTierSetFields,
} from "./types";

async function instead_of_query(db, opts: any, cb: Function): Promise<void> {
  const { options, query } = opts;
  try {
    cb(undefined, await db.membershipTiers(options, query));
  } catch (err) {
    cb(err);
  }
}

Table({
  name: "membership_tiers",
  rules: {
    primary_key: "id",
    anonymous: false,
    user_query: {
      set: {
        admin: true,
        instead_of_query,
        delete: true,
        fields: {
          id: null,
          label: null,
          store_visible: null,
          priority: null,
          price_monthly: null,
          price_yearly: null,
          project_defaults: null,
          llm_limits: null,
          features: null,
          disabled: null,
          notes: null,
        } as { [key in MembershipTierSetFields]: null },
      },
      get: {
        admin: true,
        instead_of_query,
        pg_where: [],
        fields: {
          id: null,
          label: null,
          store_visible: null,
          priority: null,
          price_monthly: null,
          price_yearly: null,
          project_defaults: null,
          llm_limits: null,
          features: null,
          disabled: null,
          notes: null,
          history: null,
          created: null,
          updated: null,
        } as { [key in MembershipTierGetFields]: null },
      },
    },
  },
  fields: {
    id: {
      type: "string",
      desc: "Unique membership tier id (slug).",
    },
    label: {
      type: "string",
      desc: "Display name for this tier.",
    },
    store_visible: {
      type: "boolean",
      desc: "Whether to show this tier in the store UI.",
    },
    priority: {
      type: "number",
      desc: "Priority for resolving multiple eligible tiers (higher wins).",
    },
    price_monthly: {
      type: "number",
      desc: "Monthly price in USD.",
      pg_type: "numeric(20,10)",
    },
    price_yearly: {
      type: "number",
      desc: "Yearly price in USD.",
      pg_type: "numeric(20,10)",
    },
    project_defaults: {
      type: "map",
      desc: "Default project quota settings applied by membership.",
    },
    llm_limits: {
      type: "map",
      desc: "LLM usage limits for this tier.",
    },
    features: {
      type: "map",
      desc: "Feature flags for this tier.",
    },
    disabled: {
      type: "boolean",
      desc: "If true, this tier is not eligible for resolution.",
    },
    notes: {
      type: "string",
      desc: "Optional admin notes.",
    },
    history: {
      type: "map",
      desc: "JSON array of previous versions of this tier.",
    },
    created: {
      type: "timestamp",
      desc: "Creation time.",
    },
    updated: {
      type: "timestamp",
      desc: "Last updated time.",
    },
  },
});
