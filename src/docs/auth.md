# Authentication and Authorization

This document explains how CoCalc authenticates users and authorizes access —
remember-me cookies, SSO/OAuth, API keys, registration tokens, and project-level
permissions.

## Overview

CoCalc supports multiple authentication methods:

- **Email/password** — traditional sign-up with hashed passwords
- **Remember-me cookies** — persistent sessions stored in the database
- **SSO/OAuth** — Google, GitHub, Facebook, Twitter, SAML, and custom OAuth2
- **API keys** — bearer tokens for programmatic access (per-account or
  per-project)
- **Registration tokens** — gate account creation on private deployments

```
┌──────────┐     Cookie / API Key     ┌────────────┐
│  Browser  │ ───────────────────────► │  Next.js   │
│  / Client │                          │  / Hub     │
└──────────┘                          └─────┬──────┘
                                            │
                              ┌──────────────┼──────────────┐
                              │              │              │
                          ┌───▼───┐   ┌──────▼────┐   ┌───▼──────┐
                          │Cookie │   │ API Key   │   │ SSO/     │
                          │Lookup │   │ Lookup    │   │ Passport │
                          └───┬───┘   └────┬──────┘   └───┬──────┘
                              │            │              │
                              └────────────┼──────────────┘
                                           │
                                    ┌──────▼──────┐
                                    │ account_id  │
                                    │ (resolved)  │
                                    └─────────────┘
```

## Authentication Methods

### Email/Password

**Password hashing**: `@cocalc/backend/auth/password-hash` — uses HMAC-based
iterative hashing. Format: `algorithm$salt$iterations$hash`.

Key files:

- `packages/server/auth/is-password-correct.ts` — verify password
- `packages/server/auth/has-password.ts` — check if account has password set
- `packages/server/auth/password-reset.ts` — initiate reset email
- `packages/server/auth/redeem-password-reset.ts` — complete reset
- `packages/server/auth/password-strength.ts` — validate strength

### Remember-Me Cookies

`packages/server/auth/remember-me.ts` — the primary session mechanism:

```typescript
async function createRememberMeCookie(
  account_id: string,
  ttl_s?: number, // default: 30 days
): Promise<{ value: string; ttl_s: number }>;
```

**How it works**:

1. Generate a random UUID v4 as a session token
2. Hash it with `passwordHash(session_id)`
3. Store the **hash** in `remember_me` table (not the raw token)
4. Cookie value format: `algorithm$salt$iterations$session_id`
5. On each request, hash the session ID from cookie and look up in DB

**Database table** (`remember_me`):

| Field        | Type        | Description                        |
| ------------ | ----------- | ---------------------------------- |
| `hash`       | `CHAR(127)` | Hashed session token (primary key) |
| `expire`     | `timestamp` | Cookie expiration                  |
| `account_id` | `UUID`      | Account this session belongs to    |

**Request authentication** (`packages/server/auth/get-account.ts`):

```typescript
// Priority: remember-me cookie → API key → unauthenticated
async function getAccountId(req): Promise<string | undefined> {
  const hash = getRememberMeHash(req);
  if (hash) {
    return await getAccountIdFromRememberMe(hash);
  }
  if (req.header("Authorization")) {
    return (await getAccountFromApiKey(req))?.account_id;
  }
  return undefined;
}
```

### SSO / OAuth (Passport)

`packages/server/auth/sso/` — integrates with Passport.js strategies:

**Supported providers**:

| Provider | Strategy                        | Package                |
| -------- | ------------------------------- | ---------------------- |
| Google   | `passport-google-oauth20`       | Built-in               |
| GitHub   | `passport-github2`              | Built-in               |
| Facebook | `passport-facebook`             | Built-in               |
| Twitter  | `@passport-js/passport-twitter` | Built-in               |
| SAML     | `@node-saml/passport-saml`      | For enterprise SSO     |
| OAuth2   | Custom                          | Generic OAuth2 support |

**Configuration**: SSO strategies are configured in the `passport_settings`
database table (admin-editable via the admin panel).

**Key files**:

- `sso/types.ts` — `StrategyConf`, `LoginInfo`, strategy type unions
- `sso/passport-login.ts` — core login flow: match/create account, set cookie
- `sso/extra-strategies.ts` — load custom strategies from `passport_settings`
- `sso/public-strategies.ts` — return enabled strategies for login page
- `sso/sanitize-profile.ts` — normalize profile data from providers
- `sso/openid-parser.ts` — OpenID Connect profile parsing

**Login flow**:

1. User clicks SSO button → redirect to provider
2. Provider callback → `passport-login.ts` processes profile
3. Match by provider ID or email → existing account or create new
4. Create remember-me cookie → redirect to app

**Exclusive SSO**: `packages/server/auth/check-email-exclusive-sso.ts` — some
email domains can be locked to a specific SSO provider, forcing users to sign in
via SSO rather than email/password.

### API Keys

`packages/server/api/manage.ts` — programmatic access tokens:

```typescript
// Key format: "sk-" + random(16) + encode62(id)
// Old format: "sk_" + random
const API_KEY_PREFIX = "sk-";

interface Options {
  account_id: string;
  action: "get" | "delete" | "create" | "edit";
  project_id?: string; // optional: key scoped to a project
  name?: string;
  expire?: Date;
  id?: number;
}
```

**Database table** (`api_keys`):

| Field        | Type        | Description                       |
| ------------ | ----------- | --------------------------------- |
| `id`         | `serial`    | Primary key                       |
| `hash`       | `text`      | Hashed API key (only hash stored) |
| `account_id` | `UUID`      | Owning account                    |
| `project_id` | `UUID`      | Optional project scope            |
| `name`       | `text`      | Human-readable name               |
| `expire`     | `timestamp` | Expiration date                   |
| `created`    | `timestamp` | Creation time                     |

**Key properties**:

- Keys are hashed before storage (like passwords)
- Can be scoped to a specific project
- Support `Bearer` and `Basic` HTTP authentication
- Max 100,000 keys per account
- Used by the Python `cocalc-api` client

**Authentication** (`packages/server/auth/api.ts`):

```typescript
function getApiKey(req: Request): string {
  const [type, user] = req.header("Authorization").split(" ");
  if (type === "Bearer") return user;
  if (type === "Basic") return atob(user).split(":")[0];
}
```

### Registration Tokens

`packages/server/auth/tokens/` — control who can create accounts:

```typescript
// packages/server/auth/tokens/redeem.ts
interface RegistrationTokenInfo {
  token: string;
  ephemeral?: number; // if set, account auto-deletes after N hours
  customize?: any; // custom account settings
}
```

**Database table** (`registration_tokens`):

| Field       | Type        | Description                       |
| ----------- | ----------- | --------------------------------- |
| `token`     | `text`      | The token string (primary key)    |
| `descr`     | `text`      | Admin description                 |
| `expires`   | `timestamp` | When the token expires            |
| `limit`     | `integer`   | Max number of uses                |
| `counter`   | `integer`   | Current use count                 |
| `disabled`  | `boolean`   | Manually disabled                 |
| `ephemeral` | `integer`   | Hours until account auto-deletion |

**Flow**: Admin creates token → shares with users → users enter token during
sign-up → token validated (expiry, counter, disabled) → account created.

Controlled by server setting `account_creation_token_required`.

## Authorization

### Project Access

Project access is checked via the `projects` table `users` JSONB field:

```typescript
// projects.users = { [account_id]: { group: "owner" | "collaborator" } }

// Check if user has access:
async function isCollaborator(
  account_id: string,
  project_id: string,
): Promise<boolean>;
```

`packages/server/projects/is-collaborator.ts` — verifies that `account_id`
appears in the project's `users` field.

### Database Query Authorization

The user query system (`packages/util/db-schema/`) uses `pg_where` rules
to restrict what data users can access:

```typescript
// Example: users can only read their own account
user_query: {
  get: {
    pg_where: [{ "account_id = $::UUID": "account_id" }],
    // Only returns rows where account_id matches the requesting user
  },
}
```

See `docs/database.md` for full details on the query permission system.

### Admin Authorization

Admins are identified by the `groups` field in the `accounts` table containing
`"admin"`. Admin-only tables use `pg_where: ["account_id::UUID IS NOT NULL"]`
(meaning: any authenticated user — but the table's `admin` flag further
restricts access).

## Additional Security

### Throttling

`packages/server/auth/throttle.ts` — rate limits authentication attempts per
IP address and account to prevent brute-force attacks.

### reCAPTCHA

`packages/server/auth/recaptcha.ts` — optional CAPTCHA verification during
account creation, configured via server settings.

### Email Verification

`packages/server/auth/redeem-verify-email.ts` — email verification flow where
users click a link to confirm their email address.

### Impersonation

`packages/server/auth/impersonate.ts` — admin-only feature to sign in as
another user for debugging/support.

### Banned Users

`packages/server/accounts/is-banned.ts` — banned users are blocked at every
authentication checkpoint (cookie validation, API key use, SSO login).

## Cookie Consent (GDPR Banner)

CoCalc ships a GDPR-style cookie consent banner powered by
[vanilla-cookieconsent v3](https://cookieconsent.orestbida.com). It is shared
between the SPA frontend (`packages/frontend`) and the Next.js landing pages
(`packages/next`) — same configuration object, same React helpers, no
duplication.

### Categories and the consent contract

Three categories, with a hard constraint:

| Category    | Read-only? | Default  | Used for                                                                  |
| ----------- | ---------- | -------- | ------------------------------------------------------------------------- |
| `necessary` | yes        | accepted | Sign-in, session, `remember_me`, version sync                             |
| `analytics` | no         | declined | Third-party tracking cookies (Google Analytics, etc.)                     |
| `usage`     | no         | declined | First-party usage metrics — `TrackingClient.user_tracking` event recording |

The `usage` category gates `frontend/client/tracking.ts#user_tracking`, the
internal click/toggle/event recorder. Two layers must agree before an event
is written: the admin-side `user_tracking` server setting AND the visitor's
acceptance of the `usage` category. If the admin disables the banner site-
wide, the cookie consent layer collapses to a passthrough and the admin
setting alone gates (legacy behaviour).

`/auth/sign-up` and `/sso/*` run the banner in **force-consent mode**:
a dark overlay covers the page and clicks outside the banner are blocked
(via vanilla-cookieconsent's `disablePageInteraction: true`). On sign-up,
the Sign Up button stays disabled and shows *"Acknowledge cookie banner
to continue"* until consent is given. `/sso/*` is gated for the same
reason — its redirect hands control to an external IdP whose callback
sets session cookies, so consent must be settled before that handoff.
`/auth/sign-in` and `/auth/try` show the banner but do not enforce it —
those flows land the user in the SPA, where the in-app force-consent
fallback (described below) kicks in if consent is still missing.

**Force-consent in the SPA**: this is the primary enforcement point for
every signed-in user. Sign-in and anonymous-try land on `/app` without
going through a force-consent overlay, and a returning user with a
`remember_me` cookie skips the auth pages entirely. (SSO is the
exception: its launch page is gated up front, since the IdP callback
drops cookies before the SPA boots.)
The SPA's root `App` component (`packages/frontend/app/render.tsx`)
waits for `accountStore.waitUntilReady()` — so the dim never flashes
during boot for users whose customize/account is still loading — and
only then, if the user is logged in *and* `hasEssentialConsent()` is
false, calls `enableForceConsent()`. That helper toggles the same
`disable--interaction` class on `<html>` that vanilla-cookieconsent uses
for its built-in overlay, and auto-removes it when the user accepts or
declines (via `cc:onConsent` / `cc:onChange`).

### Admin settings

Two server settings, both tagged `"Cookie Banner"`:

| Setting key             | Type                | Effect                                       |
| ----------------------- | ------------------- | -------------------------------------------- |
| `cookie_banner_enabled` | bool (`yes`/`no`)   | Master on/off — disables the banner entirely |
| `cookie_banner_text`    | Markdown (multiline) | Body shown in banner + preferences modal     |

Defined in `packages/util/db-schema/site-defaults.ts`. They flow through the
existing `customize` pipeline:

- **SPA**: `customize.cookie_banner_enabled` / `customize.cookie_banner_text`
  in the Redux `customize` store
- **Next.js**: `pageProps.customize.cookieBannerEnabled` /
  `pageProps.customize.cookieBannerText`

When `cookie_banner_enabled` is `no`, the banner runtime is never
instantiated and all helpers (`hasEssentialConsent`, `useEssentialConsent`,
`requireEssentialConsent`) pass through — no gating applied.

### Retrieving consent (this is the public API)

```typescript
// Synchronous helpers (work in both SPA and Next.js)
import {
  hasEssentialConsent,    // user has acknowledged the banner at all
  hasCategoryConsent,     // generic per-category check: hasCategoryConsent("usage")
  hasTrackingConsent,     // alias for hasCategoryConsent("analytics")
  getConsentSnapshot,     // {necessary, analytics, usage, timestamp, revision} | null
  showPreferences,        // open the preferences modal programmatically
  showConsentModal,       // re-open the initial banner
  requireEssentialConsent,// returns true or surfaces the banner
  enableForceConsent,     // SSO fallback: dim page + show banner until consent
} from "@cocalc/frontend/cookie-consent";

// React hook — re-renders when consent flips
import { useEssentialConsent } from "@cocalc/frontend/cookie-consent";

const ready = useEssentialConsent(); // boolean, reactive

// Subscribe to consent changes (use this before loading any analytics
// script — return early or defer until tracking flips true)
import { onConsentChange } from "@cocalc/frontend/cookie-consent";
useEffect(
  () => onConsentChange((snap) => { /* react to changes */ }),
  [],
);
```

When `cookieBannerEnabled` is false (admin disabled the banner),
`hasEssentialConsent` and `useEssentialConsent` return `true` so legacy
callers don't break.

### Adding a new analytics cookie

When wiring up new tracking — Google Analytics, Plausible, internal
tracking — gate on `hasTrackingConsent()` AND register the cookie name with
the `analytics` category's `autoClearCookies` in
`packages/frontend/cookie-consent/categories.ts`:

```typescript
{
  key: "analytics",
  label: "Analytics cookies",
  readOnly: false,
  defaultEnabled: false,
  autoClearCookies: [
    { name: /^_ga/ },     // Google Analytics
    { name: /^_gid/ },    // Google Analytics
    { name: "CC_ANA" },   // legacy CoCalc analytics
    // add new cookie names here
  ],
},
```

`autoClearCookies` is `true` by default in v3, so listing the cookie name
is sufficient — no manual revocation callback required. Reload the page
after revocation only if needed (set `autoClear.reloadPage: true` in
`init.ts`'s `buildCategoriesConfig`).

For scripts you load conditionally (like `gtag.js`), wrap the load logic in
a `useEffect` + `onConsentChange` listener: load when `analytics` is
accepted; on revocation the cookies disappear automatically and the script
itself just stops getting fresh consent. See
`packages/frontend/customize.tsx#init_analytics` for the existing pattern
that defers Google Analytics + the legacy `analytics.js` until tracking
consent.

### Adding a new cookie category (e.g. marketing)

Cookie categories are defined in one place,
`packages/frontend/cookie-consent/categories.ts`. The v3 runtime config,
the `ConsentSnapshot` type that's persisted to
`accounts.other_settings.cookie_consent`, and the SPA settings panel all
derive from this list — so adding a category is essentially one entry
plus a revision bump.

**Step 1**: append to `COOKIE_CATEGORIES`:

```typescript
// packages/frontend/cookie-consent/categories.ts
export const COOKIE_CATEGORIES = [
  { key: "necessary", label: "Necessary cookies", readOnly: true,  defaultEnabled: true },
  { key: "analytics", label: "Analytics cookies", readOnly: false, defaultEnabled: false,
    autoClearCookies: [/* … */] },
  // NEW:
  {
    key: "marketing",
    label: "Marketing cookies",
    description: "Optional. Used to deliver targeted advertising and measure campaign effectiveness.",
    readOnly: false,
    defaultEnabled: false,
    autoClearCookies: [
      { name: /^_fbp/ },        // Facebook Pixel
      { name: "_hubspotutk" },  // HubSpot
    ],
  },
] as const satisfies ReadonlyArray<CookieCategory>;
```

That's it for the runtime config and the snapshot type — TypeScript
narrows `CookieCategoryKey` to include `"marketing"` automatically and
flags any callsite (e.g. existing `hasTrackingConsent` semantics, future
consent-aware loaders) that should consider the new category.

**Step 2**: bump `COOKIE_CONSENT_REVISION` in
`packages/frontend/cookie-consent/index.ts`:

```typescript
export const COOKIE_CONSENT_REVISION = 2; // was 1
```

vanilla-cookieconsent compares the revision in the user's `cc_cookie`
against the configured one and re-prompts if they differ. Without a bump,
existing users keep their stale consent record (which doesn't mention the
new category) and never get asked.

**Step 3** (optional): if scripts/cookies are gated on the new category,
add a helper alongside `hasTrackingConsent` in `index.ts`:

```typescript
export function hasMarketingConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return CookieConsent.acceptedCategory("marketing");
  } catch {
    return false;
  }
}
```

Then gate any cookie-setting code on this helper. Cookies you list in
`autoClearCookies` for the category are removed automatically on revoke,
so the only manual code is "don't load the script unless consent is
granted."

**Step 4** (optional): the per-category title and `description` in the
preferences modal are derived from `COOKIE_CATEGORIES` automatically. The
banner intro / button labels live in `translations.ts` if you want to
tweak those.

After deploy: existing logged-in users see the banner reappear (because
of the revision bump), make a choice, and the new category boolean is
written to `accounts.other_settings.cookie_consent.marketing` — visible
in the settings panel without further changes.

### Persistence to account preferences

The browser cookie (`cc_cookie`) is the authoritative source for the live
session. Once the user is signed in, the SPA mirrors the choice into
`accounts.other_settings.cookie_consent`:

```json
{
  "necessary": true,
  "analytics": false,
  "timestamp": "2026-05-06T14:15:13.031Z",
  "revision": 1
}
```

Wired in `packages/frontend/app/render.tsx` via `onConsentChange` while
`is_logged_in` is true. The server record is for audit + UI display — we do
not restore it back into the browser (consent is browser-bound under GDPR).
Booleans rather than a `categories: string[]` array because immutable.js
mangles arrays into `{0: "x"}` when round-tripping through JSONB.

The "Cookie preferences" panel in **Account → Preferences → Communication**
(`packages/frontend/account/cookie-consent-settings.tsx`) shows the current
choice, last-updated timestamp, and a button that re-opens the preferences
modal so users can change their mind.

### Revisioning

`COOKIE_CONSENT_REVISION` (in `packages/frontend/cookie-consent/index.ts`)
is the consent version number. Bump it whenever the categories or the
banner text materially change — vanilla-cookieconsent will then re-prompt
anyone with a stale `cc_cookie`. The revision is stored alongside each
snapshot in `accounts.other_settings.cookie_consent.revision`, so old
records are easy to identify.

### Key Files

| File                                                            | Purpose                                                |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/frontend/cookie-consent/categories.ts`                | Single source of truth for cookie categories           |
| `packages/frontend/cookie-consent/init.ts`                      | `initCookieConsent` — derives v3 config from categories|
| `packages/frontend/cookie-consent/index.ts`                     | Public helpers + `useEssentialConsent` hook + revision |
| `packages/frontend/cookie-consent/state.ts`                     | Internal "is banner active" flag                       |
| `packages/frontend/cookie-consent/translations.ts`              | English strings (i18n integration is follow-up)        |
| `packages/frontend/account/cookie-consent-settings.tsx`         | SPA settings panel for managing preferences            |
| `packages/frontend/app/render.tsx`                              | Init + persist-to-account effect                 |
| `packages/next/pages/_app.tsx`                                  | Init + force-consent detection on auth routes    |
| `packages/util/db-schema/site-defaults.ts`                      | Admin settings (`cookie_banner_enabled`/`_text`) |

## Key Source Files

| File                                                | Description                                       |
| --------------------------------------------------- | ------------------------------------------------- |
| `packages/server/auth/get-account.ts`               | Main auth resolver: cookie → API key → account_id |
| `packages/server/auth/remember-me.ts`               | Remember-me cookie creation and management        |
| `packages/server/auth/hash.ts`                      | HMAC password hashing                             |
| `packages/server/auth/api.ts`                       | API key extraction from HTTP headers              |
| `packages/server/auth/is-password-correct.ts`       | Password verification                             |
| `packages/server/auth/password-reset.ts`            | Password reset initiation                         |
| `packages/server/auth/throttle.ts`                  | Rate limiting                                     |
| `packages/server/auth/recaptcha.ts`                 | CAPTCHA verification                              |
| `packages/server/auth/set-sign-in-cookies.ts`       | Cookie setting on sign-in                         |
| `packages/server/auth/sso/types.ts`                 | SSO strategy types and interfaces                 |
| `packages/server/auth/sso/passport-login.ts`        | SSO login flow                                    |
| `packages/server/auth/sso/extra-strategies.ts`      | Load custom SSO strategies                        |
| `packages/server/auth/sso/public-strategies.ts`     | Available strategies for login UI                 |
| `packages/server/auth/sso/sanitize-profile.ts`      | Normalize SSO profiles                            |
| `packages/server/auth/check-email-exclusive-sso.ts` | Domain-locked SSO enforcement                     |
| `packages/server/auth/tokens/redeem.ts`             | Registration token validation                     |
| `packages/server/auth/tokens/get-requires-token.ts` | Check if tokens required                          |
| `packages/server/api/manage.ts`                     | API key CRUD operations                           |
| `packages/server/projects/is-collaborator.ts`       | Project access check                              |
| `packages/server/accounts/is-banned.ts`             | Ban check                                         |
| `packages/backend/auth/password-hash.ts`            | Password hashing library                          |
| `packages/backend/auth/cookie-names.ts`             | Cookie name constants                             |
| `packages/util/db-schema/api-keys.ts`               | API key schema                                    |

## OAuth2 Provider

CoCalc can act as an **OAuth2 authorization server**, allowing third-party
applications (e.g., MCP tool providers) to authenticate users via CoCalc.

**Package**: `packages/auth/` — standalone package containing the OAuth2
provider implementation.

### Architecture

```
┌──────────────┐        ┌──────────────────────────────────────┐
│  Third-party │        │  CoCalc Hub                          │
│  Application │        │                                      │
│              │ ──1──► │  GET /auth/oauth/authorize           │
│              │ ◄──2── │   → check session → issue auth code  │
│              │ ──3──► │  POST /auth/oauth/token               │
│              │ ◄──4── │   → verify code → issue tokens       │
│              │ ──5──► │  GET /auth/oauth/userinfo             │
│              │ ◄──6── │   → verify token → return profile    │
└──────────────┘        └──────────────────────────────────────┘
```

### Endpoints

All mounted under the `/auth` prefix on the hub:

| Endpoint                                          | Method | Description                            |
| ------------------------------------------------- | ------ | -------------------------------------- |
| `/auth/.well-known/oauth-authorization-server`    | GET    | RFC 8414 server metadata               |
| `/auth/oauth/authorize`                           | GET    | Authorization (redirect flow)          |
| `/auth/oauth/token`                               | POST   | Token exchange                         |
| `/auth/oauth/userinfo`                            | GET    | Identity endpoint (Bearer token)       |
| `/auth/oauth/revoke`                              | POST   | Token revocation                       |

### Supported Flows

- **Authorization Code** with PKCE (RFC 7636) — recommended for all clients
- **Refresh Token** — two strategies depending on client mode:
  - **Native clients**: rotation with atomic single-use (old token is
    deleted on consume to prevent replay attacks; if the response is lost
    the client must re-authenticate)
  - **Web (confidential) clients**: reuse (same refresh token returned; no
    rotation needed since the client_secret authenticates the caller)

### Token Lifetimes

| Token              | Lifetime   | Notes                                          |
| ------------------ | ---------- | ---------------------------------------------- |
| Authorization code | 10 minutes | Single-use                                     |
| Access token       | 1 hour     | `last_active` tracked (throttled: every 5 min) |
| Refresh token      | 30 days    | Sliding for native (rotation), reused for web  |

### Expiry Cleanup

All token tables use the field name `expire` (not `expires`) so the built-in
CoCalc maintenance service (`hub/run/maintenance-expired.js`) automatically
deletes expired rows. This service runs periodically (default: every 2 hours)
and scans all tables that have an `expire` timestamp field.

### Scopes

Defined in `packages/auth/lib/types.ts` (`OAUTH2_SCOPES`):

| Scope                | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `openid`             | Basic identity (sub claim)                                                   |
| `profile`            | User name and avatar                                                         |
| `email`              | Email address                                                                |
| `api:read`           | Read-only API (list projects, ping, user search, read-only db.userQuery)     |
| `api:write`          | Write API (create projects, send messages, write db.userQuery, modify settings) |
| `api:project`        | Access all projects where user is collaborator                               |
| `api:project:{uuid}` | Access only the specified project (dynamic scope — UUID validated at runtime) |

**Scope enforcement** (in `packages/next/pages/api/conat/`):

- `/api/conat/hub` — requires `api:read` or `api:write`. Write methods need `api:write`.
  `db.userQuery` is automatically classified as read or write based on query shape
  (null values = read/SELECT, all non-null = write/UPDATE).
- `/api/conat/project` — requires `api:project` (all projects) or `api:project:{uuid}` (specific).
  Collaborator status is always checked regardless of scope.
- API key auth (no scope) — unrestricted (backwards compatible).

### Database Tables

Defined in `packages/util/db-schema/oauth2.ts`:

- **`oauth2_clients`** — registered client applications
- **`oauth2_authorization_codes`** — short-lived auth codes (single use)
- **`oauth2_access_tokens`** — bearer tokens for API access
- **`oauth2_refresh_tokens`** — long-lived tokens for refreshing access

### Configuration

1. Enable via admin settings: **OAuth2 Provider → Enable OAuth2 Provider**
2. Set the **Issuer URL** (auto-detected from DNS if empty)
3. Register clients in the admin panel: **Administration → OAuth2 Provider Clients**

### Key Files

| File                                          | Description                          |
| --------------------------------------------- | ------------------------------------ |
| `packages/auth/lib/provider.ts`               | Express router with OAuth2 endpoints |
| `packages/auth/lib/database.ts`               | Token/code/client DB operations      |
| `packages/auth/lib/client-manager.ts`         | Client CRUD operations               |
| `packages/auth/lib/crypto.ts`                 | Hashing, PKCE, token generation      |
| `packages/auth/lib/types.ts`                  | TypeScript interfaces and constants  |
| `packages/util/db-schema/oauth2.ts`           | Database table definitions           |
| `packages/hub/servers/app/oauth2-provider.ts` | Hub integration                      |
| `packages/next/pages/api/v2/oauth2/`          | Admin API routes for client mgmt     |
| `packages/frontend/admin/oauth2/`             | Admin UI component                   |

### Admin API (Next.js)

| Endpoint                     | Method | Description         |
| ---------------------------- | ------ | ------------------- |
| `/api/v2/oauth2/clients`     | GET    | List all clients    |
| `/api/v2/oauth2/clients`     | POST   | Register new client |
| `/api/v2/oauth2/[client_id]` | GET    | Get client details  |
| `/api/v2/oauth2/[client_id]` | PATCH  | Update client       |
| `/api/v2/oauth2/[client_id]` | DELETE | Delete client       |
| `/api/v2/oauth2/[client_id]` | POST   | Regenerate secret   |

## Python API Client (OAuth2)

The Python `cocalc-api` client (`src/python/cocalc-api/`) supports OAuth2
authentication in addition to traditional API keys.

### CLI Usage

```bash
# Native mode — opens browser, spawns localhost callback server, uses PKCE
cocalc-api auth login --host https://cocalc.com --client-id <UUID>

# Confidential mode — prompts for manual code paste
cocalc-api auth login --host https://cocalc.com --client-id <UUID> --client-secret <SECRET>

# Show current auth status (host, mode, token validity, etc.)
cocalc-api auth status

# Print access token to stdout (auto-refreshes if expired)
cocalc-api auth token

# Force a token refresh (reports rotation status, prints new access token)
cocalc-api auth refresh

# Show authenticated user info (fetches from server if not cached)
cocalc-api auth whoami

# Revoke and clear stored tokens
cocalc-api auth logout
```

### Programmatic Usage

```python
from cocalc_api import Hub

# 1. Explicit OAuth2 token
hub = Hub(oauth_token="...", host="https://cocalc.com")

# 2. Auto-detect stored token (from prior `cocalc-api auth login`)
hub = Hub(host="https://cocalc.com")

# 3. Traditional API key (unchanged)
hub = Hub(api_key="sk-...")
```

### Token Storage

| Item          | Location                               | Security                      |
| ------------- | -------------------------------------- | ----------------------------- |
| Access token  | `~/.config/cocalc-api/auth.json`       | File permissions (0600)       |
| User info     | `~/.config/cocalc-api/userinfo.json`   | File permissions (0600)       |
| Refresh token | System keyring (`keyring` package)     | OS-level credential store     |
| Refresh token | `auth.json` (fallback if no `keyring`) | File permissions (0600)       |

Install keyring support: `pip install cocalc-api[keyring]`

Platform-aware config directory:
- Linux: `$XDG_CONFIG_HOME/cocalc-api/` (default: `~/.config/cocalc-api/`)
- macOS: `~/Library/Application Support/cocalc-api/`
- Windows: `%APPDATA%/cocalc-api/`

### Key Files

| File                                    | Description                              |
| --------------------------------------- | ---------------------------------------- |
| `python/cocalc-api/src/cocalc_api/auth.py` | OAuth2 flow, token storage, PKCE      |
| `python/cocalc-api/src/cocalc_api/cli.py`  | CLI entry point (`cocalc-api auth`)   |
| `python/cocalc-api/src/cocalc_api/hub.py`  | Hub client (supports `oauth_token`)   |

### E2E Testing

`scripts/ci-test-oauth2.py` — exercised in CI after the hub is running:
1. Creates OAuth2 clients directly in Postgres (web + native modes)
2. Inserts authorization codes (simulating user approval)
3. Tests token exchange, userinfo, refresh, PKCE, revocation
4. Exercises CLI commands (status, token, logout)
5. Verifies `Hub(oauth_token=...)` works for API calls

## Common Patterns for Agents

### Checking Authentication in API Routes

```typescript
// packages/next/pages/api/v2/...
import getAccountId from "@cocalc/server/auth/get-account";

export default async function handler(req, res) {
  const account_id = await getAccountId(req);
  if (!account_id) {
    res.status(401).json({ error: "not signed in" });
    return;
  }
  // proceed with authenticated request
}
```

### Checking Project Access

```typescript
import isCollaborator from "@cocalc/server/projects/is-collaborator";

const hasAccess = await isCollaborator(account_id, project_id);
if (!hasAccess) {
  throw Error("you do not have access to this project");
}
```
