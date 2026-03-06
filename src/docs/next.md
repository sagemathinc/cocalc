# Next.js Application

> **Maintenance note**: Update this file when API routes, conat bridge,
> or schema validation patterns change.

Package: `packages/next`
Build: `cd packages/next && pnpm build-dev`

## Role

The Next.js app serves two purposes:

1. **Server-side rendered pages** — Public-facing pages, share pages, landing
2. **API routes** — REST endpoints for external clients and internal use

## API Routes

### v2 REST API

Location: `packages/next/pages/api/v2/`

Standard REST endpoints for account management, billing, projects, etc.

Key areas:

- `api/v2/accounts/` — Account operations
- `api/v2/auth/` — Authentication endpoints
- `api/v2/billing/` — Billing operations
- `api/v2/compute/` — (deprecated, phasing out)
- `api/v2/jupyter/` — Jupyter operations
- `api/v2/licenses/` — License management
- `api/v2/llm/` — LLM/AI endpoints
- `api/v2/messages/` — User messaging
- `api/v2/news/` — News/announcements

### Conat Bridge

Location: `packages/next/pages/api/conat/`

The conat bridge translates HTTP requests into conat messages, enabling
external clients (like the Python API) to call hub and project APIs.

#### Hub Bridge (`api/conat/hub.ts`)

```
POST /api/conat/hub
Body: { "name": "projects.createProject", "args": [...] }

→ hubBridge() → conat subject hub.account.{account_id}.api
→ Hub dispatcher → Server implementation → Response
```

#### Project Bridge (`api/conat/project.ts`)

```
POST /api/conat/project
Body: { "project_id": "...", "name": "system.exec", "args": [...] }

→ projectBridge() → conat subject project.{project_id}.0.api
→ Project daemon → Response
```

## Schema Validation

Location: `packages/next/lib/api/schema/`

API endpoints use Zod schemas for request/response validation.

### Schema Organization

```
packages/next/lib/api/schema/
├── common.ts           ← OkAPIOperationSchema, FailedAPIOperationSchema
├── accounts/           ← Profile, email, auth schemas
├── compute/            ← Server state, configuration schemas
├── projects/           ← ProjectId, title, collaborators schemas
├── purchases/          ← Shopping cart, billing schemas
├── exec.ts             ← Shell execution schemas
└── ...                 ← 30+ domain schemas
```

### Example Schema

```typescript
// packages/next/lib/api/schema/projects/common.ts
import { z } from "zod";

export const ProjectIdSchema = z.string().uuid();
export const ProjectTitleSchema = z.string();
```

### apiRoute Framework

`packages/next/lib/api/framework.ts` integrates Zod with next-rest-framework:

```typescript
// In dev mode: full Zod validation + OpenAPI docs
// In production: schema validation skipped for performance
export default apiRoute({
  routeName: apiRouteOperation({ method: "POST" })
    .input({ contentType: "application/json", body: InputSchema })
    .outputs([{ status: 200, body: OutputSchema }])
    .handler(handle),
});
```

**IMPORTANT**: When adding fields to API requests, update both:

1. The Zod schema in `packages/next/lib/api/schema/`
2. The frontend types used by `apiPost` or `api()`

### Frontend API Callers

- `packages/next/lib/api/post.ts` — `apiPost()` for Next.js internal use
- `packages/frontend/client/api.ts` — `api()` for frontend use

### Parameter Extraction

`packages/next/lib/api/get-params.ts` — Only POST requests are accepted
(GET is rejected for security). Parameters are extracted from the POST body.

## Pages Structure

```
packages/next/pages/
├── api/              ← API routes (v2, conat bridge)
├── [owner].tsx       ← Dynamic owner profile page
├── [owner]/[project] ← Project pages
├── share/            ← Public sharing pages
├── auth/             ← Auth flow pages
├── about/            ← About pages
├── billing/          ← Billing pages
├── pricing/          ← Pricing pages
└── ...               ← Other SSR pages
```
