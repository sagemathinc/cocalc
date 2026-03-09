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
