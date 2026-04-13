# Database Schema and Tables

This document covers the PostgreSQL database schema that backs CoCalc. It focuses
on the tables that appear most frequently in the codebase and are essential for
understanding data flow.

## Overview

CoCalc uses PostgreSQL as its primary data store. The schema is defined
declaratively in TypeScript using a `Table()` registration function.

### Schema Definition System

All table schemas live in `packages/util/db-schema/`. Each file calls `Table()`
to register into the global `SCHEMA` object:

```typescript
// packages/util/db-schema/types.ts
Table({ name, fields, rules });
```

- **`fields`** — column definitions with `type`, `pg_type`, `desc`
- **`rules`** — primary key, indexes, durability, and query permissions
- **`rules.user_query`** — defines what frontend clients can read/write
- **`rules.project_query`** — defines what project daemons can read/write

The index file (`packages/util/db-schema/index.ts`) side-effect-imports all
schema files, making the entire schema available as `SCHEMA`.

### Access Patterns

**From hub/backend code** — use the connection pool directly:

```typescript
import getPool from "@cocalc/database/pool";
const pool = getPool();
const { rows } = await pool.query("SELECT * FROM accounts WHERE account_id = $1", [id]);
```

**From frontend** — use schema-driven user queries via SyncTable or the API.
Queries are validated against `user_query` rules and filtered by `pg_where`
clauses (e.g., `account_id`, `project_id`).

### Durability Levels

| Level | Meaning | Used by |
|-------|---------|---------|
| `hard` (default) | Fully persisted | accounts, projects, purchases |
| `soft` | May be lost without serious impact | project_log, cursors, file_use, stats |
| ephemeral | In-memory only (SyncTable, no DB) | ipywidgets |

### Virtual Tables

Many tables are **virtual** — they query the same underlying PostgreSQL table
but with different permissions or filters. For example, `crm_accounts` is a
virtual table over `accounts` that grants admin-only access to all fields.

```typescript
Table({
  name: "crm_accounts",
  rules: { virtual: "accounts", user_query: { get: { admin: true, ... } } },
  fields: schema.accounts.fields,
});
```

---

## Core Tables

### `accounts`

**File**: `packages/util/db-schema/accounts.ts`
**Primary key**: `account_id` (UUID)

Every registered user. This is the most-queried table in the system.

| Field | Type | Description |
|-------|------|-------------|
| `account_id` | UUID | Primary key |
| `email_address` | VARCHAR(254) | Unique email (optional — SSO users may not have one) |
| `password_hash` | VARCHAR(173) | SHA-512 hash with salt |
| `first_name`, `last_name` | VARCHAR(254) | Display name |
| `name` | VARCHAR(39) | Globally unique username (optional) |
| `created` | timestamp | Account creation time |
| `last_active` | timestamp | Last activity |
| `groups` | TEXT[] | Group memberships (e.g., `['admin']`) |
| `passports` | map | SSO logins: `{"strategy-id": profile}` |
| `editor_settings` | map | Editor config (font size, key bindings, etc.) |
| `other_settings` | map | General settings (dark mode, confirm close, etc.) |
| `terminal` | map | Terminal settings |
| `banned` | boolean | Account banned flag |
| `deleted` | boolean | Account deleted flag |
| `balance` | REAL | Current USD balance (not source of truth — display only) |
| `min_balance` | REAL | Minimum allowed balance (admin-set credit limit) |
| `auto_balance` | map | Auto-topup configuration |
| `stripe_customer_id` | string | Stripe integration |
| `api_key` | string | Full-access API key (`sk_...`, 24 chars, base62) |
| `ssh_keys` | map | SSH key fingerprints to key objects |
| `purchase_closing_day` | integer | Billing cutoff day (1–28) |
| `profile` | map | Avatar and presence data |
| `lti_id` | TEXT[] | LTI ISS and user IDs |
| `unlisted` | boolean | Exclude from name searches |
| `tags` | TEXT[] | Interest tags |

**Key indexes**: `created`, `last_active DESC`, `email_address` (unique),
`lti_id`, `((passports IS NOT NULL))`, `((ssh_keys IS NOT NULL))`

**Virtual tables**: `crm_accounts` (admin), `crm_agents` (admin accounts only),
`accounts_v2` (name search), `collaborators` (find collaborators)

---

### `projects`

**File**: `packages/util/db-schema/projects.ts`
**Primary key**: `project_id` (UUID)

Every project. Central to most of CoCalc's functionality.

| Field | Type | Description |
|-------|------|-------------|
| `project_id` | UUID | Primary key |
| `title` | string | Short title |
| `description` | string | Markdown description |
| `name` | VARCHAR(100) | Unique name per owner |
| `users` | map | `{account_id: {group:"owner"\|"collaborator", hide, upgrades, ssh}}` |
| `deleted` | boolean | Soft-delete flag |
| `created` | timestamp | Creation time |
| `last_edited` | timestamp | Last file edit time |
| `last_active` | map | `{account_id: timestamp}` per-user activity |
| `state` | map | `{state:"running"\|"stopped"\|..., time, ip, error}` |
| `status` | map | Detailed status from project daemon |
| `settings` | map | Base quotas: `{cores, memory, disk_quota, network, mintime, ...}` |
| `run_quota` | map | Actual running quota (computed) |
| `site_license` | map | `{license_id: {memory, cores, ...}}` applied licenses |
| `action_request` | map | `{action:"start"\|"stop", started, finished, err}` |
| `compute_image` | string | Underlying compute image name |
| `course` | map | Course management: `{project_id, path, pay, account_id}` |
| `env` | map | Additional environment variables |
| `sandbox` | boolean | Auto-add visiting users as collaborators |
| `host` | map | `{host: hostname, assigned: timestamp}` |
| `pay_as_you_go_quotas` | map | PAYG quotas per account |
| `secret_token` | VARCHAR(256) | Ephemeral auth token |
| `manage_users_owner_only` | boolean | Restrict collaborator management to owners |
| `avatar_image_tiny` | string | 32x32 image (~3kb) |
| `color` | string | Visual identification color |
| `lti_id` | TEXT[] | LTI context IDs |

**Key indexes**: `last_edited`, `created`, `USING GIN (users)`,
`USING GIN (state)`, `((state ->> 'state'))`, `deleted`, `site_license`

**User query constraints**: Only projects edited in the last 6 weeks are
returned by default (`PROJECTS_CUTOFF = "6 weeks"`), limited to 300 results.

**Virtual tables**: `projects_all`, `projects_admin`, `projects_owner`,
`project_avatar_images`, `crm_projects`

---

### `syncstrings`

**File**: `packages/util/db-schema/syncstring-schema.ts`
**Primary key**: `string_id` (CHAR(40) — SHA1 of project_id + path)

Coordination record for each collaboratively-edited document. See
[syncstrings.md](syncstrings.md) for full architecture details.

| Field | Type | Description |
|-------|------|-------------|
| `string_id` | CHAR(40) | `sha1(project_id, path)` |
| `project_id` | UUID | Owning project |
| `path` | string | File path |
| `users` | UUID[] | Editor account IDs (index = user_id in patches) |
| `last_active` | timestamp | Last user interaction |
| `last_snapshot` | timestamp | Most recent snapshot time |
| `snapshot_interval` | integer | Patches between snapshots (default: 300) |
| `doctype` | string | JSON: `{"type":"string"}` or `{"type":"db","opts":{...}}` |
| `save` | map | `{state:"requested"\|"done", hash, error}` |
| `init` | map | `{time, size, error}` |
| `read_only` | boolean | File is read-only |
| `settings` | map | Shared editing config |
| `archived` | UUID | Blob ID if patches are archived |
| `huge` | boolean | Too many patches to process |

**Related tables**: `patches`, `cursors`, `eval_inputs`, `eval_outputs`,
`ipywidgets` — all keyed by `string_id`. See [syncstrings.md](syncstrings.md).

---

### `patches`

**File**: `packages/util/db-schema/syncstring-schema.ts`
**Primary key**: `(string_id, time, is_snapshot)` — compound

Individual edit patches for synchronized documents.

| Field | Type | Description |
|-------|------|-------------|
| `string_id` | CHAR(40) | Which syncstring |
| `time` | timestamp | Logical timestamp |
| `wall` | timestamp | Wallclock time for display |
| `user_id` | integer | Index into `syncstrings.users` |
| `patch` | TEXT | JSON-encoded compressed DMP patch |
| `is_snapshot` | boolean | Whether this is a snapshot entry |
| `snapshot` | string | Full document state (if snapshot) |
| `parents` | INTEGER[] | Parent patch timestamps (DAG) |
| `version` | integer | User-friendly version number |
| `format` | integer | 0 = string, 1 = db-doc |
| `seq_info` | map | Conat sequence info for incremental loading |

**Constraints**: `unique_writes: true` — no reason to write the same patch
twice. Cannot change `user_id` or `patch` after creation.

---

### `server_settings`

**File**: `packages/util/db-schema/server-settings.ts`
**Primary key**: `name` (string)

Global configuration for the entire CoCalc installation.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Setting name |
| `value` | string | Setting value (stored as string) |
| `readonly` | boolean | Externally controlled — UI should not edit |

**Access**: Admin-only set; values are read by the server at startup and cached.
Settings are defined in `packages/util/db-schema/site-defaults.ts` and
`site-settings-extras.ts`, which enumerate all valid setting names with
defaults, types, and descriptions.

Common settings include: `site_name`, `site_description`, `help_email`,
`commercial` (boolean), `ssh_gateway`, `default_quotas`, `max_upgrades`,
`email_enabled`, AI/LLM configuration, and many more.

---

### `passport_settings`

**File**: `packages/util/db-schema/server-settings.ts`
**Primary key**: `strategy` (string)

SSO (Single Sign-On) authentication strategy configuration.

| Field | Type | Description |
|-------|------|-------------|
| `strategy` | string | Unique lowercase identifier (e.g., `google`, `github`) |
| `conf` | map | Strategy configuration consumed by `auth.ts` |
| `info` | map | Public display info: `{icon, display, public, exclusive_domains, disabled}` |

Used by the login system to determine which SSO buttons to show and how to
authenticate users.

---

### `site_licenses`

**File**: `packages/util/db-schema/site-licenses.ts`
**Primary key**: `id` (UUID)

License keys that upgrade project quotas.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | License ID |
| `title` | string | Descriptive name |
| `description` | string | Longer description |
| `info` | map | `{purchased: PurchaseInfo}` — specs and price |
| `activates` | timestamp | When license starts working |
| `expires` | timestamp | When license stops working |
| `created` | timestamp | Creation time |
| `last_used` | timestamp | Last used (throttled) |
| `managers` | TEXT[] | Account IDs allowed to manage |
| `run_limit` | integer | Max simultaneously running upgraded projects |
| `quota` | map | `{cpu, ram, disk, member, boost, idle_timeout, always_running, ...}` |
| `upgrades` | map | Legacy format: `{cores, memory, disk_quota, network, mintime}` |
| `subscription_id` | integer | If auto-renewing |
| `voucher_code` | string | If created from voucher |

**Virtual tables**: `manager_site_licenses`, `site_license_public_info`,
`site_license_usage_stats`, `projects_using_site_license`,
`matching_site_licenses`

---

### `purchases`

**File**: `packages/util/db-schema/purchases.ts`
**Primary key**: `id` (integer, auto-increment)

All financial transactions. Negative `cost` = credit to user.

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-increment ID |
| `time` | timestamp | When recorded |
| `account_id` | UUID | Who is paying |
| `cost` | number | Cost in USD (negative = credit) |
| `cost_per_hour` | number | Hourly rate (metered purchases) |
| `period_start`, `period_end` | timestamp | Billing period |
| `service` | string | Category: `license`, `compute-server`, `openai-*`, etc. |
| `description` | map | Service-specific details |
| `project_id` | UUID | Affected project (optional) |
| `invoice_id` | string | Stripe invoice/payment intent (unique) |
| `day_statement_id` | integer | Daily statement |
| `month_statement_id` | integer | Monthly statement |
| `tag` | string | Analytics tag |

**Service types**: `credit`, `refund`, `license`, `project-upgrade`,
`compute-server`, `compute-server-network-usage`, `compute-server-storage`,
`openai-*` (LLM usage), `voucher`, `edit-license`

**Virtual tables**: `crm_purchases` (admin)

---

### `subscriptions`

**File**: `packages/util/db-schema/subscriptions.ts`
**Primary key**: `id` (integer)

Recurring subscription management.

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-increment ID |
| `account_id` | UUID | Subscriber |
| `cost` | number | Cost per period in USD |
| `interval` | string | `"month"` or `"year"` |
| `status` | string | `"active"`, `"canceled"`, `"unpaid"`, `"past_due"` |
| `current_period_start` | timestamp | Period start |
| `current_period_end` | timestamp | Period end |
| `metadata` | map | `{type:"license", license_id}` |
| `canceled_at` | timestamp | When canceled |

---

## Activity and Logging Tables

### `project_log`

**File**: `packages/util/db-schema/project-log.ts`
**Primary key**: `id` (UUID)
**Durability**: soft

Activity log for each project (file opens, settings changes, etc.).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Event ID |
| `project_id` | UUID | Which project |
| `time` | timestamp | When (kept for 2 months) |
| `account_id` | UUID | Who |
| `event` | map | What happened (JSON) |

**Indexes**: `project_id`, `time`, `account_id`

---

### `file_use`

**File**: `packages/util/db-schema/file-use.ts`
**Primary key**: `id` (CHAR(40) — SHA1 of project_id + path)
**Durability**: soft

Tracks file access for notifications and "last edited" info.

| Field | Type | Description |
|-------|------|-------------|
| `id` | CHAR(40) | `sha1(project_id, path)` |
| `project_id` | UUID | Which project |
| `path` | string | File path |
| `users` | map | `{account_id: {edit: timestamp, chat: timestamp, open: timestamp}}` |
| `last_edited` | timestamp | Most recent edit (kept for 21 days) |

---

### `central_log`

**File**: `packages/util/db-schema/central-log.ts`
**Primary key**: `id` (UUID)
**Durability**: soft

System-wide analytics log. Not read by frontend (except admins).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Event ID |
| `event` | string | Event name (must start with `"webapp-"` for user-set events) |
| `value` | map | Arbitrary JSON data |
| `time` | timestamp | When |
| `expire` | timestamp | Auto-deletion time |

---

### `blobs`

**File**: `packages/util/db-schema/blobs.ts`
**Primary key**: `id` (UUID — derived from SHA1 of content)

Binary data storage for uploads, Sage worksheet output, etc.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | SHA1-based content hash |
| `blob` | Buffer | Binary content |
| `size` | number | Size in bytes |
| `expire` | timestamp | Expiration time |
| `created` | timestamp | Creation time |
| `project_id` | UUID | Associated project |
| `account_id` | UUID | Creator (recorded since late 2024) |
| `gcloud` | string | Cloud storage bucket name |
| `compress` | string | `"gzip"` or `"zlib"` |

**Limits**: `MAX_BLOB_SIZE = 10MB`, daily per-project limit of 100MB
(licensed) or 10MB (unlicensed).

---

## Infrastructure Tables

### `hub_servers`

**File**: `packages/util/db-schema/hub-servers.ts`
**Primary key**: `host` (VARCHAR(63))
**Durability**: soft

Active hub server instances for load balancing.

| Field | Type | Description |
|-------|------|-------------|
| `host` | VARCHAR(63) | Hostname |
| `port` | integer | Port number |
| `clients` | integer | Connected client count |
| `expire` | timestamp | TTL for this record |

---

### `stats`

**File**: `packages/util/db-schema/stats.ts`
**Primary key**: `id` (UUID)
**Durability**: soft

Periodic system-wide statistics snapshots.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Snapshot ID |
| `time` | timestamp | When computed |
| `accounts` | integer | Total account count |
| `projects` | integer | Total project count |
| `accounts_created` | map | Counts by time window: `{"5min", "1h", "1d", "7d", "30d"}` |
| `accounts_active` | map | Same windows |
| `projects_created` | map | Same windows |
| `projects_edited` | map | Same windows |
| `running_projects` | map | Currently running projects |
| `hub_servers` | JSONB[] | Active hub server info |

---

### `registration_tokens`

**File**: `packages/util/db-schema/registration-tokens.ts`
**Primary key**: `token` (string)

Tokens required to create accounts (admin-managed).

| Field | Type | Description |
|-------|------|-------------|
| `token` | string | The token string |
| `descr` | string | Description |
| `expires` | timestamp | Expiration time |
| `limit` | number | Max accounts to create |
| `counter` | number | Accounts created so far (read-only) |
| `disabled` | boolean | Disable this token |
| `ephemeral` | number | Lifetime in ms for created accounts/projects |
| `customize` | map | Account customization overrides |

---

### `public_paths`

**File**: `packages/util/db-schema/public-paths.ts`
**Primary key**: `id` (CHAR(40) — SHA1 of project_id + path)

Published/shared files and directories.

| Field | Type | Description |
|-------|------|-------------|
| `id` | CHAR(40) | `sha1(project_id, path)` |
| `project_id` | UUID | Which project |
| `path` | string | File/directory path |
| `name` | VARCHAR(100) | Unique name within project |
| `description` | string | Description |
| `disabled` | boolean | Unpublish without deleting |
| `unlisted` | boolean | Hide from public listing |
| `authenticated` | boolean | Require login to view |
| `counter` | integer | View count |
| `license` | string | Content license |
| `redirect` | string | Redirect URL |
| `jupyter_api` | boolean | Enable Jupyter API access |

---

## Query Permission System

### User Queries

Each table defines `user_query.get` and `user_query.set` rules:

```typescript
user_query: {
  get: {
    pg_where: ["account_id"],         // filter by authenticated user
    fields: { account_id: null, ... },  // allowed fields (null = no default)
    admin: true,                       // admin-only access
    options: [{ limit: 100 }],         // query options
  },
  set: {
    fields: {
      account_id: "account_id",        // auto-filled from session
      project_id: "project_write",     // must have write access
      title: true,                     // user can set freely
    },
    check_hook(db, obj, account_id, project_id, cb) { ... },
    before_change(db, old_val, new_val, account_id, cb) { ... },
    on_change(db, old_val, new_val, account_id, cb) { ... },
  },
}
```

### `pg_where` Magic Values

| Value | Meaning |
|-------|---------|
| `"account_id"` | Filter to authenticated user's account |
| `"projects"` | Filter to user's projects |
| `"project_id"` | Must specify and have read access |
| `"project_id-public"` | Must specify; project has public paths |
| `"all_projects_read"` | All project IDs user can read |
| `"collaborators"` | All account IDs of user's collaborators |

### Hook System

| Hook | When | Purpose |
|------|------|---------|
| `check_hook` | Before processing | Validate permissions |
| `before_change` | Before DB write | Pre-processing, validation |
| `on_change` | After DB write | Side effects, notifications |
| `instead_of_change` | Replaces DB write | Custom write logic |
| `instead_of_query` | Replaces entire query | Custom query logic |

---

## CRM Virtual Tables

Most core tables have `crm_*` counterparts for admin access:

| Virtual Table | Base Table | Notes |
|---------------|------------|-------|
| `crm_accounts` | accounts | All fields + notes, salesloft_id |
| `crm_projects` | projects | All fields + notes |
| `crm_purchases` | purchases | Set tag/notes |
| `crm_subscriptions` | subscriptions | Set notes |
| `crm_site_licenses` | site_licenses | Full admin access |
| `crm_project_log` | project_log | Admin read |
| `crm_file_use` | file_use | Admin read |
| `crm_syncstrings` | syncstrings | Admin read |
| `crm_patches` | patches | Admin read (limit 200) |

---

## Key Source Files

| File | Description |
|------|-------------|
| `packages/util/db-schema/index.ts` | Schema registry — imports all schema files |
| `packages/util/db-schema/types.ts` | `Table()` function, `TableSchema`, `Fields` types |
| `packages/util/db-schema/accounts.ts` | Accounts schema |
| `packages/util/db-schema/projects.ts` | Projects schema |
| `packages/util/db-schema/syncstring-schema.ts` | Syncstrings, patches, cursors, eval, ipywidgets |
| `packages/util/db-schema/server-settings.ts` | Server/passport settings |
| `packages/util/db-schema/site-defaults.ts` | All server setting names and defaults |
| `packages/util/db-schema/site-licenses.ts` | License management |
| `packages/util/db-schema/purchases.ts` | Financial transactions |
| `packages/util/db-schema/subscriptions.ts` | Recurring subscriptions |
| `packages/util/db-schema/blobs.ts` | Binary storage |
| `packages/util/db-schema/project-log.ts` | Activity logging |
| `packages/util/db-schema/file-use.ts` | File access tracking |
| `packages/util/db-schema/central-log.ts` | System-wide analytics |
| `packages/util/db-schema/public-paths.ts` | Published files |
| `packages/util/db-schema/registration-tokens.ts` | Signup tokens |
| `packages/util/db-schema/client-db.ts` | Client-side DB helpers (`sha1`, etc.) |
| `packages/database/pool/pool.ts` | PostgreSQL connection pool |
| `packages/database/postgres/` | Server-side query implementations |
