/*
 * Software licensing for installable products (Launchpad/Rocket).
 */

import { Table } from "./types";

export interface SoftwareLicenseTier {
  id: string;
  label?: string;
  description?: string;
  max_accounts?: number;
  max_project_hosts?: number;
  max_active_licenses?: number;
  defaults?: Record<string, any>;
  features?: Record<string, any>;
  disabled?: boolean;
  notes?: string;
  created?: Date;
  updated?: Date;
}

export interface SoftwareLicense {
  id: string;
  tier_id?: string;
  owner_account_id?: string;
  created?: Date;
  expires_at?: Date;
  revoked_at?: Date | null;
  token?: string;
  limits?: Record<string, any>;
  features?: Record<string, any>;
  notes?: string;
  created_by?: string;
  last_refresh_at?: Date | null;
}

Table({
  name: "software_license_tiers",
  rules: {
    primary_key: "id",
  },
  fields: {
    id: {
      type: "string",
      desc: "Unique software license tier id (slug).",
    },
    label: {
      type: "string",
      desc: "Display name for this tier.",
    },
    description: {
      type: "string",
      desc: "Optional description for this tier.",
    },
    max_accounts: {
      type: "number",
      desc: "Maximum number of accounts allowed for this tier.",
    },
    max_project_hosts: {
      type: "number",
      desc: "Maximum number of project hosts allowed for this tier.",
    },
    max_active_licenses: {
      type: "number",
      desc: "Maximum number of active software licenses a user can create for this tier.",
    },
    defaults: {
      type: "map",
      desc: "Default license parameters (e.g. expires_days, grace_days).",
    },
    features: {
      type: "map",
      desc: "Feature flags for this tier.",
    },
    disabled: {
      type: "boolean",
      desc: "If true, this tier is disabled.",
    },
    notes: {
      type: "string",
      desc: "Optional admin notes.",
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

Table({
  name: "software_licenses",
  rules: {
    primary_key: "id",
    pg_indexes: [
      "tier_id",
      "owner_account_id",
      "created",
      "expires_at",
      "revoked_at",
    ],
  },
  fields: {
    id: {
      type: "uuid",
      desc: "License id (uuid).",
    },
    tier_id: {
      type: "string",
      desc: "Tier id that defines default limits for this license.",
    },
    owner_account_id: {
      type: "uuid",
      desc: "Account that owns this license.",
    },
    created: {
      type: "timestamp",
      desc: "Creation time.",
    },
    expires_at: {
      type: "timestamp",
      desc: "When this license expires.",
    },
    revoked_at: {
      type: "timestamp",
      desc: "When this license was revoked, if ever.",
    },
    token: {
      type: "string",
      desc: "Signed license token (public).",
    },
    limits: {
      type: "map",
      desc: "Overrides for limits (accounts, project hosts, etc.).",
    },
    features: {
      type: "map",
      desc: "Overrides for feature flags.",
    },
    notes: {
      type: "string",
      desc: "Optional admin notes.",
    },
    created_by: {
      type: "uuid",
      desc: "Admin account that created the license.",
    },
    last_refresh_at: {
      type: "timestamp",
      desc: "Last time this license refreshed against the licensing service.",
    },
  },
});

Table({
  name: "software_license_events",
  rules: {
    primary_key: "id",
    pg_indexes: ["license_id", "ts"],
  },
  fields: {
    id: {
      type: "uuid",
      desc: "Event id.",
    },
    license_id: {
      type: "uuid",
      desc: "License id this event applies to.",
    },
    ts: {
      type: "timestamp",
      desc: "Event timestamp.",
    },
    event: {
      type: "string",
      desc: "Event type (created, revoked, refreshed, etc.).",
    },
    metadata: {
      type: "map",
      desc: "Event metadata.",
    },
    actor_account_id: {
      type: "uuid",
      desc: "Account that triggered the event (if any).",
    },
  },
});
