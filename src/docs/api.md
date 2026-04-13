# External API

> **Maintenance note**: Update this file when API endpoints, the Python client,
> or the conat bridge protocol change.

## API Call Flow

```
Python/HTTP Client
       │
       ▼
  POST /api/conat/hub  (or /api/conat/project)
       │
       ▼
  Next.js API Route (packages/next/pages/api/conat/)
       │
       ▼
  hubBridge() / projectBridge()
       │
       ▼
  Conat Message → hub.account.{account_id}.api
       │
       ▼
  Hub API Dispatcher (packages/conat/hub/api/)
       │
       ▼
  Server Implementation (packages/server/conat/api/)
       │
       ▼
  Response back through the chain
```

## Hub API Methods

Accessed via `POST /api/conat/hub`:

```json
{
  "name": "projects.createProject",
  "args": [{ "title": "My Project" }]
}
```

### Available Services

| Service       | Example Methods                                                                        |
| ------------- | -------------------------------------------------------------------------------------- |
| `projects.*`  | `createProject`, `start`, `stop`, `setQuotas`, `addCollaborator`, `removeCollaborator` |
| `db.*`        | Database query operations                                                              |
| `purchases.*` | Payment, subscription management                                                       |
| `jupyter.*`   | Kernel management, code execution                                                      |
| `system.*`    | Health, version, stats                                                                 |
| `messages.*`  | User messaging                                                                         |
| `org.*`       | Organization management                                                                |

## Project API Methods

Accessed via `POST /api/conat/project`:

```json
{
  "project_id": "uuid-here",
  "name": "system.exec",
  "args": [{ "command": "ls", "args": ["-la"] }]
}
```

### Available Services

| Service                 | Methods                |
| ----------------------- | ---------------------- |
| `system.ping`           | Health check           |
| `system.exec`           | Execute shell commands |
| `system.jupyterExecute` | Run Jupyter code       |

## Python API Client

Location: `python/cocalc-api/`

The official Python client library, published as `cocalc-api` on PyPI.

### Structure

```
python/cocalc-api/
├── src/cocalc_api/     ← Client library source
│   └── mcp/            ← MCP (Model Context Protocol) client
├── tests/              ← Test suite
└── Makefile            ← Build/test convenience commands
```

### Usage

```python
from cocalc_api import CoCalcAPI

client = CoCalcAPI(api_key="sk-...")

# Create a project
project = client.projects.create(title="My Project")

# Execute code in a project
result = client.projects.exec(
    project_id=project["project_id"],
    command="echo hello",
)
```

### Method Registration

The Python client uses decorators to map methods to conat API calls:

```python
@api_method("projects.createProject")
def create(self, title: str, ...):
    ...
```

This maps to `POST /api/conat/hub` with
`{"name": "projects.createProject", "args": [...]}`.

## v2 REST API

In addition to the conat bridge, there are traditional REST endpoints at
`/api/v2/`. These are documented in `packages/next/pages/api/v2/` and
validated with Zod schemas in `packages/next/lib/api/schema/`.

## Authentication

All API requests require an API key via HTTP `Bearer` or `Basic` auth:

```
Authorization: Bearer <api_key>
Authorization: Basic <base64(api_key:)>
```

For Basic auth, the password field is empty. The Next.js bridge validates the key and resolves
the associated `account_id` (or `project_id` for project-scoped keys) before
forwarding to conat.

Only POST requests are accepted — GET is rejected for security.

## Error Handling

```typescript
// Success responses vary by endpoint:
{
  status: "ok";
}
// or
{
  project_id: "...";
}

// Error responses:
{
  error: "error message";
}
```

## Async Operations

Some operations support fire-and-forget mode:

```json
{ "project_id": "...", "command": "long-task", "async_call": true }
```

Returns `{ "type": "async", "job_id": "...", "status": "running" }`.
Poll with `async_get: job_id` to retrieve results.

## Timeouts

- Conat bridge default: 15,000ms (15 seconds)
- Project bridge uses `waitForInterest: true` to wait for project readiness
- Individual operations may have their own timeout parameters
