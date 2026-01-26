# CLAUDE.md and GEMINI.md

This file provides guidance to Claude Code (claude.ai/code) and also Gemini CLI (https://github.com/google-gemini/gemini-cli) when working with code in this repository.

# CoCalc Source Repository

- This is the source code of CoCalc in a Git repository
- It is a complex JavaScript/TypeScript SaaS application
- CoCalc is organized as a monorepository (multi-packages) in the subdirectory "./packages"
- The packages are managed as a pnpm workspace in "./packages/pnpm-workspace.yaml"

## Code Style

- Everything is written in TypeScript code
- Indentation: 2-spaces
- Run `pnpm exec prettier -w [filename]` after modifying a file (ts, tsx, md, json, ...) to format it correctly.
- All .js and .ts files are formatted by the tool prettier
- Add suitable types when you write code
- Follow DRY principles!
- TypeScript: prefer `var1 ?? var2` for fallbacks. only use `var1 || var2` in explicit or-chains or when necessary.
- Variable name styles are `camelCase` for local and `FOO_BAR` for global variables. React Components and Classes are `FooBar`. If you edit older code not following these guidelines, adjust this rule to fit the file's style.
- Some older code is JavaScript or CoffeeScript, which will be translated to TypeScript
- Use ES modules (import/export) syntax, not CommonJS (require)
- Organize the list of imports in such a way: installed npm packages are on top, newline, then are imports from @cocalc's code base. Sorted alphabetically.
- **Colors**: Always use the `COLORS` dictionary from `@cocalc/util/theme` for all color values. Never hardcode colors like `#f0f0f0` or `rgb(...)`. Import with `import { COLORS } from "@cocalc/util/theme";` and use predefined constants like `COLORS.GRAY_M`, `COLORS.GRAY_L`, `COLORS.GRAY_LL`, etc.
- **Backend Logging**: Use `getLogger` from `@cocalc/project/logger` for logging in backend code. Do NOT use `console.log`. Example: `const L = getLogger("module:name").debug;`

## Development Commands

### Essential Commands

- `pnpm build-dev` - Build all packages for development
- `pnpm clean` - Clean all `node_modules` and `dist` directories
- `pnpm test` - Run full test suite
- `pnpm depcheck` - Check for dependency issues
- `python3 ./scripts/check_npm_packages.py` - Check npm package consistency across packages
- `pnpm exec prettier -w [filename]` to format the style of a file after editing it
- After creating a file, run `git add [filename]` to start tracking it

### Package-Specific Commands

- `cd packages/[package] && pnpm build` - Build and compile a specific package
  - For packages/next and packages/static, run `cd packages/[package] && pnpm build-dev`
- `cd packages/[package] && pnpm test` - Run tests for a specific package
- **TypeScript checking (frontend)**:
  - Quick check: `cd packages/frontend && pnpm tsc` - Runs TypeScript type checker only (no compilation, but takes several minutes and reports all TS errors)
  - Full compile: `cd packages/static && pnpm build-dev` - Compiles the frontend and reports TypeScript errors (use this as the authoritative build)
- **IMPORTANT**: When modifying packages like `util` that other packages depend on, you must run `pnpm build` in the modified package before typechecking dependent packages

### Development

- **IMPORTANT**: Always run `pnpm exec prettier -w [filename]` immediately after editing any .ts, .tsx, .md, or .json file to ensure consistent styling
- After TypeScript or `*.tsx` changes, run `pnpm build` in the relevant package directory
  - **When editing the frontend, ALWAYS run `pnpm build-dev` in `packages/static`** (this implicitly builds the frontend)
    - This is the authoritative way to build and test frontend changes
    - Example: `cd packages/static && pnpm build-dev`
    - Do NOT just run `pnpm build` in packages/frontend alone

## Build Dependencies & Compilation Order

CoCalc is a monorepo with multiple interdependent packages. The build order matters: dependencies must be
compiled before packages that depend on them.

**Build orchestration:** The build process is managed by `workspaces.py` script (root level). See
[workspaces.py](workspaces.py#L105-L135) for the explicit package build order.

### Root-Level Build Commands

For convenience, the root `package.json` provides shortcuts that use `workspaces.py`:

| Command          | Purpose                                                         |
| ---------------- | --------------------------------------------------------------- |
| `pnpm build-dev` | Clean build with all dev dependencies (same as `pnpm make-dev`) |
| `pnpm build`     | Production build (same as `pnpm make`)                          |
| `pnpm clean`     | Clean all build artifacts and node_modules                      |
| `pnpm tsc-all`   | Run TypeScript type checking across all packages in parallel    |

**For a clean development build from scratch:**

```bash
pnpm clean
pnpm build-dev
```

This runs from the root directory:

1. `workspaces.py clean` - Removes dist and node_modules
2. `workspaces.py install` - Reinstalls dependencies
3. `workspaces.py build --dev` - Builds all packages in dependency order
4. `pnpm python-api` - Builds Python API

### Dependency Map

**Base Packages (no internal dependencies):**

- **util** - Shared utilities, types, and database schema used by all other packages
- **conat** - Pub/sub messaging framework (browser and Node.js compatible)
- **comm** - Communication layer between project and frontend
- **sync** - Real-time synchronization framework

**Backend/Data Packages:**

- **backend** - Backend functionality (depends on: util, conat)
- **database** - PostgreSQL database layer and queries (depends on: backend, conat, util)

**Frontend Packages:**

- **frontend** - React UI components and pages (depends on: assets, cdn, comm, conat, jupyter, sync, util)
- **static** - Build system and webpack bundler for frontend (depends on: assets, backend, cdn, frontend, util)

**Server Packages:**

- **hub** - Main HTTP server and orchestrator (depends on: assets, backend, cdn, conat, database, next, server, static, util)
- **next** - Next.js API server (depends on: backend, util)

**Other Packages:**

- **assets** - Static assets (images, fonts, etc.)
- **cdn** - CDN utilities
- **jupyter** - Jupyter notebook support
- **server** - Base server utilities
- **sync-client**, **sync-fs** - Synchronization clients

### Compilation Workflow

**Simple approach (RECOMMENDED):** From the root directory, run:

```bash
pnpm clean && pnpm build-dev
```

This will:

- Clean all build artifacts
- Reinstall dependencies
- Build all packages in the correct dependency order (via `workspaces.py`)
- Handle all the complexity for you

If you only need to rebuild after changing code (not dependencies), just run:

```bash
pnpm build-dev
```

from the root directory.

**Manual approach (if needed):** If you want to rebuild only specific packages:

#### When modifying `util`

1. Build the util package: `cd packages/util && pnpm build`
2. Rebuild all dependents: From root, run `pnpm build-dev`

Or just use `pnpm clean && pnpm build-dev` from root to be safe.

#### When modifying `backend` or `database`

1. Build the modified package: `cd packages/backend && pnpm build` or `cd packages/database && pnpm build`
2. Rebuild everything: `pnpm build-dev` from root

#### When modifying `frontend` code

**IMPORTANT:** For frontend development, use these commands:

- **For development builds:** `cd packages/static && pnpm build-dev`
  - This compiles the entire frontend application
  - The `static` package is the build coordinator for the web application
  - It automatically compiles dependencies as needed
  - Run this after making changes to see them in the dev server

- **For TypeScript checking:** `cd packages/frontend && pnpm tsc`
  - Quick type checking without full compilation
  - Reports all TypeScript errors in the frontend code
  - Much faster than full build (takes several minutes)

#### When modifying `conat`, `comm`, or `sync`

1. Build the modified package: `cd packages/[package] && pnpm build`
2. Rebuild everything: `pnpm build-dev` from root

### Frontend Development Quick Commands

**REMEMBER: To build frontend changes, use `pnpm build-dev` in `packages/static`, NOT `packages/frontend`!**

```bash
# Check TypeScript errors in frontend (fast)
cd packages/frontend && pnpm tsc

# Build frontend for development (includes compilation) ⭐️ MOST COMMON COMMAND
cd packages/static && pnpm build-dev

# Full rebuild from scratch (from root)
pnpm clean && pnpm build-dev
```

### Build Dependency Order (for reference)

The authoritative build order is defined in [workspaces.py:105-135](workspaces.py#L105-L135) in the
`all_packages()` function. The order includes:

- **cdn** - packages/hub assumes this is built
- **util** - foundational
- **sync**, **sync-client**, **sync-fs** - synchronization
- **conat** - pub/sub framework
- **backend** - backend functionality
- **api-client**, **jupyter**, **comm** - communication
- **project**, **assets** - project management and assets
- **frontend** - (static depends on frontend; frontend depends on assets)
- **static** - (packages/hub assumes this is built)
- **server** - (packages/next assumes this is built)
- **database** - (packages/next assumes this is built)
- **file-server**
- **next** - Next.js server
- **hub** - (hub won't build if next isn't already built)

**You don't need to follow this manually.** The `workspaces.py` script handles it automatically. Just run
`pnpm build-dev` from the root directory.

### Quick Reference for Common Tasks

**Frontend Development (most common):**

| Task                       | Command                                | Notes                                   |
| -------------------------- | -------------------------------------- | --------------------------------------- |
| **Check TS errors (FAST)** | `cd packages/frontend && pnpm tsc`     | Does NOT compile, just checks types     |
| **Build for dev**          | `cd packages/static && pnpm build-dev` | Full compilation, run this to test code |
| **Clean dev build**        | `pnpm clean && pnpm build-dev` (root)  | When dependencies change                |

**Other Tasks:**

| Task                                   | Command                        | Why                                          |
| -------------------------------------- | ------------------------------ | -------------------------------------------- |
| Full rebuild from scratch (START HERE) | `pnpm clean && pnpm build-dev` | From root; uses workspaces.py                |
| Edit util types/code                   | `pnpm clean && pnpm build-dev` | util is foundational; affects all dependents |
| Edit backend/database                  | `pnpm clean && pnpm build-dev` | Rebuild to ensure all deps are correct       |
| Check TypeScript errors everywhere     | `pnpm tsc-all`                 | Parallel type checking from root             |
- **IMPORTANT**: Always run `prettier -w [filename]` immediately after editing any .ts, .tsx, .md, or .json file to ensure consistent styling

#### When Working on Frontend Code

After making changes to files in `packages/frontend`:

1. **Typecheck**: Run `cd packages/frontend && pnpm tsc --noEmit` to check for TypeScript errors
2. **Build**: Run `cd packages/static && pnpm build-dev` to compile the frontend for testing

**DO NOT** run `pnpm build` in `packages/frontend` - it won't work as expected for frontend development.

#### When Working on Other Packages

- After TypeScript changes, run `pnpm build` in the relevant package directory

## Architecture Overview

### Package Structure

CoCalc is organized as a monorepo with key packages:

- **frontend** - React/TypeScript frontend application using Redux-style stores and actions
- **backend** - Node.js backend services and utilities
- **hub** - Main server orchestrating the entire system
- **database** - PostgreSQL database layer with queries and schema
- **util** - Shared utilities and types used across packages
- **comm** - Communication layer including WebSocket types
- **conat** - CoCalc's container/compute orchestration system
- **sync** - Real-time synchronization system for collaborative editing
- **project** - Project-level services and management
- **static** - Static assets and build configuration
- **next** - Next.js server components

### Key Architectural Patterns

#### Frontend Architecture

- **Redux-style State Management**: Uses custom stores and actions pattern (see `packages/frontend/app-framework/actions-and-stores.ts`)
- **TypeScript React Components**: All frontend code is TypeScript with proper typing
- **Modular Store System**: Each feature has its own store/actions (AccountStore, BillingStore, etc.)
- **WebSocket Communication**: Real-time communication with backend via WebSocket messages
- **Authentication Waiting**: When frontend code needs to wait for user authentication, use `redux.getStore("account").async_wait({ until: () => store.get_account_id() != null, timeout: 0 })` to wait indefinitely until authentication completes
- **Conat DKV Usage**: For key-value storage with real-time sync, use `webapp_client.conat_client.dkv({ account_id, name: "store-name" })` to get a distributed key-value store that syncs across sessions

#### Backend Architecture

- **PostgreSQL Database**: Primary data store with sophisticated querying system
- **WebSocket Messaging**: Real-time communication between frontend and backend
- **Conat System**: Container orchestration for compute servers
- **Event-Driven Architecture**: Extensive use of EventEmitter patterns
- **Microservice-like Packages**: Each package handles specific functionality
- **Database Access**: Use `getPool()` from `@cocalc/database/pool` for direct database queries in hub/backend code. Example: `const pool = getPool(); const { rows } = await pool.query('SELECT * FROM table WHERE id = $1', [id]);`
- **Hub Migration Functions**: Migration functions in hub should be designed to run once at startup, use batch processing with delays between batches to avoid database saturation

#### Communication Patterns

- **WebSocket Messages**: Primary communication method (see `packages/comm/websocket/types.ts`)
- **Database Queries**: Structured query system with typed interfaces
- **Event Emitters**: Inter-service communication within backend
- **REST-like APIs**: Some HTTP endpoints for specific operations
- **API Schema**: API endpoints in `packages/next/pages/api/v2/` use Zod schemas in `packages/next/lib/api/schema/` for validation. These schemas must be kept in harmony with the TypeScript types sent from frontend applications using `apiPost` (in `packages/next/lib/api/post.ts`) or `api` (in `packages/frontend/client/api.ts`). When adding new fields to API requests, both the frontend types and the API schema validation must be updated.
- **Conat Frontend → Hub Communication**: CoCalc uses a custom distributed messaging system called "Conat" for frontend-to-hub communication:
  1. **Frontend ConatClient** (`packages/frontend/conat/client.ts`): Manages WebSocket connection to hub, handles authentication, reconnection, and provides API interfaces
  2. **Core Protocol** (`packages/conat/core/client.ts`): NATS-like pub/sub/request/response messaging with automatic chunking, multiple encoding formats (MsgPack, JSON), and delivery confirmation
  3. **Hub API Structure** (`packages/conat/hub/api/`): Typed interfaces for different services (system, projects, db, purchases, jupyter) that map function calls to conat subjects
  4. **Message Flow**: Frontend calls like `hub.projects.setQuotas()` → ConatClient.callHub() → conat request to subject `hub.account.{account_id}.api` → Hub API dispatcher → actual service implementation
  5. **Authentication**: Each conat request includes account_id and is subject to permission checks at the hub level
  6. **Subjects**: Messages are routed using hierarchical subjects like `hub.account.{uuid}.{service}` or `project.{uuid}.{compute_server_id}.{service}`

#### CoCalc Conat Hub API Architecture

**API Method Registration Pattern:**

- **Registry**: `packages/conat/hub/api/projects.ts` contains `export const projects = { methodName: authFirstRequireAccount }`
- **Implementation**: `packages/server/conat/api/projects.ts` contains `export async function methodName() { ... }`
- **Flow**: Python client `@api_method("projects.methodName")` → POST `/api/conat/hub` → `hubBridge()` → conat subject `hub.account.{account_id}.api` → registry lookup → implementation

**Example - projects.createProject:**

1. **Python**: `@api_method("projects.createProject")` decorator
2. **HTTP**: `POST /api/conat/hub {"name": "projects.createProject", "args": [...]}`
3. **Bridge**: `hubBridge()` routes to conat subject
4. **Registry**: `packages/conat/hub/api/projects.ts: createProject: authFirstRequireAccount`
5. **Implementation**: `packages/server/conat/api/projects.ts: export { createProject }` → `@cocalc/server/projects/create`

### Key Technologies

- **TypeScript**: Primary language for all new code
- **React**: Frontend framework
- **PostgreSQL**: Database
- **Node.js**: Backend runtime
- **WebSockets**: Real-time communication
- **pnpm**: Package manager and workspace management
- **Jest**: Testing framework
- **SASS**: CSS preprocessing
- **CodeMirror 5**: Existing text editor (code, latex, markdown files)
- **CodeMirror 6**: Modern editor for new features (see [CODEMIRROR6_SETUP.md](dev/CODEMIRROR6_SETUP.md) for Jupyter single-file view)

### Database Schema

- Comprehensive schema in `packages/util/db-schema`
- Query abstractions in `packages/database/postgres/`
- Type-safe database operations with TypeScript interfaces

### Testing

- **Jest**: Primary testing framework
- **ts-jest**: TypeScript support for Jest
- **jsdom**: Browser environment simulation for frontend tests
- Test files use `.test.ts` or `.spec.ts` extensions
- Each package has its own jest.config.js

### Import Patterns

- Use absolute imports with `@cocalc/` prefix for cross-package imports
- Example: `import { cmp } from "@cocalc/util/misc"`
- Type imports: `import type { Foo } from "./bar"`
- Destructure imports when possible

### Development Workflow

1. **Frontend changes**: After editing `packages/frontend`, typecheck with `cd packages/frontend && pnpm tsc --noEmit`, then build with `cd packages/static && pnpm build-dev`
2. **Other package changes**: After TypeScript changes, run `pnpm build` in the relevant package directory
3. Database must be running before starting hub
4. Hub coordinates all services and should be restarted after changes
5. Use `pnpm clean && pnpm build-dev` when switching branches or after major changes

# Workflow

- Be sure to build when you're done making a series of code changes
- Prefer running single tests, and not the whole test suite, for performance

## Git Workflow

- Never modify a file when in the `master` or `main` branch
- All changes happen through feature branches, which are pushed as pull requests to GitHub
- When creating a new file, run `git add [filename]` to track the file.
- Prefix git commits with the package and general area. e.g. 'frontend/latex: ...' if it concerns latex editor changes in the packages/frontend/... code.
- When pushing a new branch to Github, track it upstream. e.g. `git push --set-upstream origin feature-foo` for branch "feature-foo".

## React-intl / Internationalization (i18n)

CoCalc uses react-intl for internationalization with SimpleLocalize as the translation platform.

### Architecture Overview

- **Library**: Uses `react-intl` library with `defineMessages()` and `defineMessage()`
- **Default Language**: English uses `defaultMessage` directly - no separate English translation files
- **Supported Languages**: 19+ languages including German, Chinese, Spanish, French, Italian, Dutch, Russian, Japanese, Portuguese, Korean, Polish, Turkish, Hebrew, Hindi, Hungarian, Arabic, and Basque
- **Translation Platform**: SimpleLocalize with OpenAI GPT-4o for automatic translations

### Translation ID Naming Convention

Translation IDs follow a hierarchical pattern: `[directory].[subdir].[filename].[aspect].[label|title|tooltip|...]`

Examples:

- `labels.account` - for common UI labels
- `account.sign-out.button.title` - for account sign-out dialog
- `command.generic.force_build.label` - for command labels

### Usage Patterns

- **TSX Components**: `<FormattedMessage id="..." defaultMessage="..." />`
- **Data Structures**: `defineMessage({id: "...", defaultMessage: "..."})`
- **Programmatic Use**: `useIntl()` hook + `intl.formatMessage()`
- **Non-React Contexts**: `getIntl()` function

### Translation Workflow

**For new translation keys:**

1. Add the translation to source code (e.g., `packages/frontend/i18n/common.ts`)
2. Run `pnpm i18n:extract` - updates `extracted.json` from source code
3. Run `pnpm i18n:upload` - sends new strings to SimpleLocalize
4. New keys are automatically translated to all languages
5. Run `pnpm i18n:download` - fetches translations
6. Run `pnpm i18n:compile` - compiles translation files

**For editing existing translation keys:**
Same flow as above, but **before 3. i18n:upload**, delete the key. Only new keys are auto-translated. `pnpm i18n:delete [id]`.

### Translation File Structure

- `packages/frontend/i18n/README.md` - detailed documentation
- `packages/frontend/i18n/common.ts` - shared translation definitions (labels, menus, editor, jupyter, etc.)
- `packages/frontend/i18n/extracted.json` - auto-extracted messages from source code
- `packages/frontend/i18n/trans/[locale].json` - downloaded translations from SimpleLocalize
- `packages/frontend/i18n/trans/[locale].compiled.json` - compiled translation files for runtime
- `packages/frontend/i18n/index.ts` - exports and locale loading logic

# Ignore

- Ignore files covered by `.gitignore`
- Ignore everything in `node_modules` or `dist` directories
- Ignore all files not tracked by Git, unless they are newly created files

# CoCalc Python API Client Investigation

## Overview

The `python/cocalc-api/` directory contains a uv-based Python client library for the CoCalc API, published as the `cocalc-api` package on PyPI.

It also contains a test framework (`python/cocalc-api/tests/README.md`) and an MCP client (`python/cocalc-api/src/cocalc_api/mcp/README.md`).
For convenience, a `python/cocalc-api/Makefile` exists.

## Client-Server Architecture Investigation

### API Call Flow

1. **cocalc-api Client** (Python) → HTTP POST requests
2. **Next.js API Routes** (`/api/conat/{hub,project}`) → Bridge to conat messaging
3. **ConatClient** (server-side) → NATS-like messaging protocol
4. **Hub API Implementation** (`packages/conat/hub/api/`) → Actual business logic

### Endpoints Discovered

#### Hub API: `POST /api/conat/hub`

- **Bridge**: `packages/next/pages/api/conat/hub.ts` → `hubBridge()` → conat subject `hub.account.{account_id}.api`
- **Implementation**: `packages/conat/hub/api/projects.ts`
- **Available Methods**: `createProject`, `start`, `stop`, `setQuotas`, `addCollaborator`, `removeCollaborator`, etc.

#### Project API: `POST /api/conat/project`

- **Bridge**: `packages/next/pages/api/conat/project.ts` → `projectBridge()` → conat project subjects
- **Implementation**: `packages/conat/project/api/` (system.ping, system.exec, system.jupyterExecute)

# important-instruction-reminders

- Do what has been asked; nothing more, nothing less.
- ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
- ALWAYS ask questions if something is unclear. Only proceed to the implementation step if you have no questions left.
- When modifying a file with a copyright banner at the top, make sure to fix/add the current year to indicate the copyright year.
