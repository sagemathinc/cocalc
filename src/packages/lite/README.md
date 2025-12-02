# CoCalc Lite

## Overview

`@cocalc/lite` is a **standalone, single-machine CoCalc instance** that can run completely offline or optionally sync with a remote CoCalc hub as a compute server.  This package essentially provides a "CoCalc in a box" that mirrors the full architecture but in a simplified, single-machine format.

## Role and Boundaries

- Lite is the shared minimal hub/server/sqlite core that both [../plus](../plus/README.md) (CoCalcPlus) and [../project-host](../project-host/README.md) build on.
- Keep Lite neutral and reusable: product defaults belong in Plus; host-level podman/btrfs/ssh plumbing belongs in Project Host.
- Prefer upstreaming shared improvements here instead of duplicating them downstream; maintain a small dependency surface so Lite stays easy to embed.
- Avoid adding container orchestration, filesystem drivers, or ssh ingress here—those are layered on by the host package.

### Key Characteristics

- **Lightweight & Portable**: Minimal dependencies, can be compiled to a single executable binary (SEA - Single Executable Application)
- **SQLite-based**: Uses SQLite instead of PostgreSQL for local data storage
- **Self-contained**: Includes HTTP server, authentication, blob storage, and project services
- **Desktop-ready**: Can be wrapped in Electron for desktop app distribution
- **Dual-mode**: Works standalone OR as a compute server connected to remote CoCalc

### Architecture

```
┌─ Express HTTP Server (port configurable)
│  ├─ Static assets (frontend from packages/static)
│  ├─ Blob upload/download endpoints
│  └─ WebSocket for Conat messaging
│
├─ Conat Server (real-time messaging)
│  ├─ Project services (computation)
│  ├─ Changefeeds (real-time data sync)
│  ├─ LLM integration (AI features)
│  └─ ACP (Agent/AI prompt execution)
│
└─ SQLite Database
   ├─ Generic key-value storage
   ├─ User queries for changefeeds
   └─ Settings & blob metadata
```

## Package Structure

```
packages/lite/
├── bin/
│   └── start.js              # CLI entry point (executable binary)
├── hub/                       # Hub-like functionality for lite mode
│   ├── api.ts                # Lightweight hub API implementation
│   ├── acp.ts                # Agent/AI prompt execution service
│   ├── changefeeds.ts        # Real-time data change notifications
│   ├── llm.ts                # LLM (Language Model) integration
│   ├── proxy.ts              # HTTP proxy for remote connections
│   ├── settings.ts           # Configuration/customization payload
│   ├── blobs/                # File blob storage
│   │   ├── download.ts       # Download blob handler
│   │   └── upload.ts         # Upload blob handler
│   └── sqlite/               # SQLite database layer
│       ├── database.ts       # Database abstraction
│       ├── user-query.ts     # Query interface for changefeeds
│       └── changefeeds.ts    # Change feed implementation
├── sea/                       # Single Executable Application builder
│   ├── build-bundle.sh       # Bundle creation script
│   ├── build-sea.sh          # SEA compilation script
│   └── README.md             # SEA documentation
├── auth-token.ts            # Cookie/token authentication
├── http.ts                   # Express HTTP server setup
├── main.ts                   # Application entry point & initialization
├── remote.ts                 # Remote CoCalc connection handler
├── index.js                  # Electron wrapper for desktop app
└── package.json              # Dependencies and build scripts
```

## Main Components

### Entry Points

- **`bin/start.js`**: CLI executable - Sets up DATA directory, PORT, and PATH for special binaries, then calls main()
- **`index.js`**: Electron wrapper - Creates Electron app window, spins up CoCalc Lite backend, manages menus and app lifecycle
- **`main.ts`**: Core initialization orchestrator
  - Initializes HTTP server (HTTP/HTTPS)
  - Creates Conat server for internal communication
  - Sets up project services, changefeeds, LLM, and ACP agents
  - Optionally connects to remote CoCalc instance

### HTTP/Network Layer

- **`http.ts`**: Express server setup
  - Handles HTTP/HTTPS server creation
  - Auto-generates self-signed certificates
  - Serves static assets from /static path
  - Configures authentication middleware
  - Handles file downloads, blob uploads/downloads
  - Serves customization payload

- **`auth-token.ts`**: Authentication system
  - Cookie-based authentication with `cocalc-lite-auth` cookie
  - Supports one-time query parameter tokens
  - Uses timing-safe password verification
  - Sets 90-day cookie expiration

### Hub Functionality

- **`hub/api.ts`**: Lightweight hub API
  - Subscribes to `hub.*.*.api` messages
  - Delegates to local SQLite for queries
  - Falls back to remote hub if available
  - Implements minimal HubApi interface

- **`hub/changefeeds.ts`**: Real-time data synchronization
  - Provides changefeed server for browser clients
  - Uses SQLite backend with user query interface
  - Sends notifications when data changes

- **`hub/settings.ts`**: Configuration management
  - Builds customize payload for frontend
  - Loads site settings from SQLite
  - Provides defaults specific to lite mode

- **`hub/llm.ts`**: LLM (Large Language Model) integration
  - Integrates with LangChain and Ollama
  - Loads API keys from settings (OpenAI, Google Vertex AI, Anthropic, Mistral)
  - Provides token counting via heuristics

- **`hub/acp.ts`**: Agent Codex Protocol (AI prompt execution)
  - Manages CodexAcpAgent for code execution
  - Falls back to EchoAgent if CodexAcpAgent unavailable
  - Materializes blobs for prompts
  - Supports streaming responses

### Data Layer

- **`hub/sqlite/database.ts`**: SQLite wrapper
  - Uses Node.js built-in `DatabaseSync` API (synchronous)
  - Enables WAL (Write-Ahead Logging) for concurrency
  - Creates generic data table with (table_name, pk, row) structure
  - Provides CRUD operations (upsert, delete, get, list)

- **`hub/sqlite/user-query.ts`**: Query interface for changefeeds
  - Implements database queries used by changefeeds
  - Seeds default data (account, project)
  - Supports query subscriptions with change callbacks
  - EventEmitter-based architecture

### Blob Storage

- **`hub/blobs/upload.ts`**: File upload handler
  - POST /blobs endpoint
  - Uses formidable for form parsing
  - Calculates SHA1 hash of uploaded files
  - Stores in distributed key-value store (AKV) with optional TTL

- **`hub/blobs/download.ts`**: File download handler
  - GET /blobs/\* endpoint
  - Supports ETag caching (if-none-match returns 304)
  - Supports inline view or download (attachment header)
  - Long cache lifetime (1 year)

### Remote Connection

- **`remote.ts`**: Remote CoCalc instance integration
  - Reads COMPUTE_SERVER env variable (URL with apiKey and compute_server_id)
  - Initializes compute server connection if present
  - Sets up HTTP proxy for WebSocket upgrade requests
  - Allows lite instance to act as a compute server for remote CoCalc

- **`hub/proxy.ts`**: HTTP proxy for remote connections
  - Uses http-proxy-3 library
  - Proxies /conat-remote requests to remote hub
  - Handles WebSocket upgrades with authentication cookie

## Environment Variables

- **`PORT`**: Server port (auto-detected if not set)
- **`HOST`**: Server hostname (supports https://hostname syntax)
- **`AUTH_TOKEN`**: Optional authentication token for access control
- **`COMPUTE_SERVER`**: URL for remote connection (format: `http://host:port?apiKey=KEY&id=ID`)
- **`DATA`**: Storage directory for SQLite and local files

## Use Cases

1. **Offline Development**: Run CoCalc completely offline on your laptop
2. **Edge Computing**: Deploy as a binary on edge devices
3. **Desktop App**: Package as Electron app for Mac/Windows/Linux
4. **Compute Server**: Connect to remote CoCalc hub as additional compute capacity

## Build

Set the version in package.json.

Then build the relevant code and node_modules:

```sh
pnpm build-lite
```

This will produce a file `build/lite/cocalc-lite....tar.xz` that is the built source code and contents of node_modules folders needed to run cocalc-lite.
You could untar this somewhere with the same version of node used to build it and run the script `lite/bin/start.js` in the tarball to run cocalc-lite.

Next build a Single Executable Application (SEA), which combines the above tarball with the copy of nodejs you're using in to a single binary:

```sh
pnpm build-sea
```

That will build a binary in `build/sea/cocalc-lite...`. You can run it. You can also copy it to any reasonably modern Linux computer with the same processor architecture and run it.

## MacOS

The above is also supported on MacOS. However, the SEA needs to be signed, sealed, packaged, etc. in order for anybody to use it. This requires buying a dev cert from Apple for $99/year, etc. There is a script that hopefully automates this, once you have properly set everything up.

## Running CoCalc Lite

### Direct Execution (requires Node.js 22+)

```sh
pnpm app
```

### Electron Desktop App

```sh
pnpm app-electron
```

### Single Binary (after building SEA)

```sh
./build/sea/cocalc-lite-[version]
```

## Build Scripts

- `pnpm build` - TypeScript compilation
- `pnpm build:static` - Build static frontend assets
- `pnpm build:tarball` - Create distributable tarball
- `pnpm sea` - Build Single Executable Application binary
- `pnpm app` - Run cocalc-lite directly
- `pnpm app-electron` - Run as Electron desktop app

## Key Technologies

- **Runtime**: Node.js >= 22
- **Web Server**: Express.js
- **Database**: SQLite with WAL mode
- **Messaging**: Conat (NATS-like pub/sub)
- **Authentication**: Cookie + token-based
- **Desktop**: Electron (optional)
- **File Upload**: formidable
- **HTTP Proxy**: http-proxy-3
- **SSL**: Self-signed certificate generation
- **Frontend**: React (from packages/static)
- **AI/LLM**: LangChain + Ollama + external APIs
- **Backend Services**: From packages/backend, project, conat

## How It Fits into CoCalc Architecture

The lite package is designed as a **simplified, standalone architecture** that mirrors key hub functionality:

- **Monolithic vs Microservice**: Unlike the full CoCalc which uses PostgreSQL and multiple services, lite uses SQLite and co-located services
- **Conat Integration**: Uses the same Conat messaging system as full CoCalc for internal communication
- **Project Services**: Runs project services (computation) directly, similar to compute servers
- **Dual-mode Operation**:
  - **Standalone**: Works completely offline with local SQLite
  - **Remote-connected**: Can act as a compute server for a remote CoCalc instance
- **Frontend Agnostic**: Uses the same frontend from `packages/static` as full CoCalc
