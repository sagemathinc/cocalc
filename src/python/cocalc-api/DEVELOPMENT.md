# CoCalc Python API Client — Development Notes

## Client-Server Architecture

### API Call Flow

1. **cocalc-api Client** (Python) → HTTP POST requests
2. **Next.js API Routes** (`/api/conat/{hub,project}`) → Bridge to conat messaging
3. **ConatClient** (server-side) → NATS-like messaging protocol
4. **Hub API Implementation** (`src/packages/conat/hub/api/`) → Actual business logic

### Hub API: `POST /api/conat/hub`

- **Bridge**: `src/packages/next/pages/api/conat/hub.ts` → `hubBridge()` → conat subject `hub.account.{account_id}.api`
- **Implementation**: `src/packages/conat/hub/api/projects.ts`
- **Available Methods**: `createProject`, `start`, `stop`, `setQuotas`, `addCollaborator`, `removeCollaborator`, etc.

### Project API: `POST /api/conat/project`

- **Bridge**: `src/packages/next/pages/api/conat/project.ts` → `projectBridge()` → conat project subjects
- **Implementation**: `src/packages/conat/project/api/` (system.ping, system.exec, system.jupyterExecute)
