# Project Daemon

> **Maintenance note**: Update this file when the project daemon API,
> servers, conat integration, or data directory layout changes.

Package: `packages/project`
Entry point: `packages/project/project.ts`

## Role

Each CoCalc project runs its own Node.js daemon process. This daemon:

- Executes shell commands and code on behalf of the user
- Manages Jupyter kernels
- Handles file operations (read, write, list, move, delete)
- Participates in real-time collaborative editing via conat sync
- Exposes an API via conat for the hub and frontend to call
- Runs code formatters (Prettier, Black, Go, Rust, R, etc.)
- Manages Sage worksheet sessions
- Optionally provides SSH access

### Startup Flags

```
--hub-port <n>      TCP port for hub connections (default: random)
--browser-port <n>  HTTP port for browser clients (default: random)
--hostname          Bind address (default: 127.0.0.1)
--kucalc            Kubernetes mode
--daemon            Run as daemon
--sshd              Start SSH daemon
--init <script>     Run initialization script
```

## Network Servers

The project daemon starts three network services:

### 1. Hub TCP Server

- **Port**: Dynamic, stored in `$DATA/.smc/hub-server.port`
- **Purpose**: Legacy messaging protocol with hub
- **Security**: Hub initiates connection; authenticates with secret token
- **Location**: `packages/project/servers/hub/`
- **Message types**: `heartbeat`, `project_exec`, `jupyter_execute`,
  `read_file_from_project`, `write_file_to_project`, `send_signal`, etc.

### 2. Browser WebSocket Server

- **Port**: Dynamic, stored in `$DATA/.smc/browser-server.port`
- **Technology**: Primus WebSocket with multiplex + responder plugins
- **Base path**: `/{project_id}/raw/`
- **Location**: `packages/project/servers/browser/`
- **Services**: Direct WebSocket API, sync filesystem, WebSocket SFTP

### 3. HTTP API Server (localhost only)

- **Port**: Dynamic, stored in `$DATA/.smc/api-server.port`
- **Location**: `packages/project/http-api/server.ts`
- **Endpoints**: `/api/v1/read-text-file`, `/api/v1/write-text-file`
- **Auth**: Bearer token or Basic auth with secret token
- **Rate limit**: 150 requests/minute

## Conat Integration

The project connects to conat using either an API key or project secret
token + project ID (via cookies).

### Subject Routing

```
project.{project_id}.{compute_server_id}.api         — RPC API
project.{project_id}.{compute_server_id}.open-files   — Open file tracking
project.{project_id}.{compute_server_id}.listings     — Directory listings
project.{project_id}.{compute_server_id}.stream.>     — Persistent streams
project.{project_id}.{compute_server_id}.pubsub-*     — Ephemeral pub/sub
```

The `compute_server_id` is `0` for regular projects.

### API Registration

Type definitions: `packages/conat/project/api/`
Implementations: `packages/project/conat/api/`

```typescript
interface ProjectApi {
  system: System; // exec, files, jupyter, signals
  editor: Editor; // formatters, notebook ops, terminals
  sync: Sync; // sync protocol
}
```

## System API Methods

The `system` service handles core project operations:

| Method                                  | Purpose                  |
| --------------------------------------- | ------------------------ |
| `ping()`                                | Health check             |
| `test()`                                | API key scope validation |
| `version()`                             | Get API version          |
| `exec(opts)`                            | Execute shell command    |
| `signal(signal, pid\|pids)`             | Send signal to process   |
| `listing(path, hidden)`                 | Directory listing        |
| `deleteFiles(paths)`                    | Delete files             |
| `moveFiles(paths, dest)`                | Move files               |
| `renameFile(src, dest)`                 | Rename file              |
| `realpath(path)`                        | Resolve symlinks         |
| `canonicalPaths(paths[])`               | Normalize paths          |
| `readTextFileFromProject(path)`         | Read text file           |
| `writeTextFileToProject(path, content)` | Write text file          |
| `configuration(aspect)`                 | Project capabilities     |
| `jupyterExecute(opts)`                  | Execute notebook cells   |
| `listJupyterKernels()`                  | List running kernels     |
| `stopJupyterKernel(pid)`                | Terminate kernel         |
| `terminate(service)`                    | Terminate a service      |

## Editor API Methods

The `editor` service handles file editing operations:

| Method                    | Purpose               |
| ------------------------- | --------------------- |
| `formatterString()`       | Code formatting       |
| `jupyterStripNotebook()`  | Strip notebook output |
| `jupyterRunNotebook()`    | Run notebook          |
| `jupyterNbconvert()`      | nbconvert integration |
| `jupyterKernelLogo()`     | Get kernel logo       |
| `jupyterKernels()`        | Kernel metadata       |
| `newFile()`               | Create new file       |
| `createTerminalService()` | Create terminal       |
| `printSageWS()`           | Sage worksheet to PDF |

## Project Package Structure

```
packages/project/
├── project.ts           ← Main entry point and startup
├── init-program.ts      ← CLI flags and environment setup
├── data.ts              ← Configuration (project_id, secret_token, etc.)
├── client.ts            ← Client interface
├── conat/
│   ├── connection.ts    ← Conat connection management
│   ├── api/
│   │   ├── index.ts     ← API dispatch loop
│   │   ├── system.ts    ← System service implementations
│   │   ├── editor.ts    ← Editor service implementations
│   │   └── sync.ts      ← Sync service implementations
│   ├── listings.ts      ← Directory listing service
│   └── open-files.ts    ← Open file tracking
├── servers/
│   ├── hub/             ← Hub TCP server and message handling
│   └── browser/         ← Browser WebSocket server
├── http-api/            ← Local HTTP API server
├── jupyter/             ← Jupyter kernel management
├── formatters/          ← Code formatters (prettier, black, go, etc.)
├── sage_session.ts      ← Sage worksheet sessions
├── read_write_files.ts  ← File I/O operations
├── blobs.ts             ← Binary blob storage
├── configuration.ts     ← Capability detection
├── named-servers/       ← User-defined named servers
├── public-paths.ts      ← Public sharing management
├── x11/                 ← X11 app detection
├── sshd.ts              ← Optional SSH daemon
├── kucalc.ts            ← Kubernetes metrics and health
├── logger.ts            ← Structured logging
└── ...
```

## Data Directory

The project stores runtime data in `$DATA/.smc/` (default `~/.smc/`):

| File                  | Purpose                     |
| --------------------- | --------------------------- |
| `hub-server.port`     | Hub TCP port                |
| `browser-server.port` | Browser HTTP port           |
| `api-server.port`     | Internal API port           |
| `secret_token`        | Authentication token        |
| `info.json`           | Project metadata            |
| `session-id.txt`      | Unique session ID           |
| `start-timestamp.txt` | When project started        |
| `sage_server/`        | Sage server logs/pids/ports |

### Environment Variables

| Variable            | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `COCALC_PROJECT_ID` | Project UUID                               |
| `COCALC_USERNAME`   | Project username (derived from project_id) |
| `COMPUTE_SERVER_ID` | Compute server ID (0 for regular projects) |
| `HOME`              | Home directory (required)                  |
| `DATA`              | Data directory (required)                  |

## Logging

Always use the structured logger in project code:

```typescript
import { getLogger } from "@cocalc/project/logger";

const L = getLogger("module:name").debug;
L("something happened", { data });
```

Do NOT use `console.log` in project code.
