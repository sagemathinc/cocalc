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
- Run `prettier -w [filename]` after modifying a file (ts, tsx, md, json, ...) to format it correctly.
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
- `prettier -w [filename]` to format the style of a file after editing it
- After creating a file, run `git add [filename]` to start tracking it

### Package-Specific Commands

- `cd packages/[package] && pnpm build` - Build and compile a specific package
  - For packages/next and packages/static, run `cd packages/[package] && pnpm build-dev`
- `cd packages/[package] && pnpm test` - Run tests for a specific package
- To typecheck the frontend, it is best to run `cd packages/static && pnpm build` - this implicitly compiles the frontend and reports TypeScript errors
- **IMPORTANT**: When modifying packages like `util` that other packages depend on, you must run `pnpm build` in the modified package before typechecking dependent packages

### Development

- **IMPORTANT**: Always run `prettier -w [filename]` immediately after editing any .ts, .tsx, .md, or .json file to ensure consistent styling
- After TypeScript or `*.tsx` changes, run `pnpm build` in the relevant package directory
  - When editing the frontend, run `pnpm build-dev` in `packages/static` (this implicitly builds the frontend)

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

### Key Technologies

- **TypeScript**: Primary language for all new code
- **React**: Frontend framework
- **PostgreSQL**: Database
- **Node.js**: Backend runtime
- **WebSockets**: Real-time communication
- **pnpm**: Package manager and workspace management
- **Jest**: Testing framework
- **SASS**: CSS preprocessing

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

1. Changes to TypeScript require compilation (`pnpm build` in relevant package)
2. Database must be running before starting hub
3. Hub coordinates all services and should be restarted after changes
4. Use `pnpm clean && pnpm build-dev` when switching branches or after major changes
5. **IMPORTANT**: After any frontend code changes, run `pnpm build-dev` in the `packages/static` directory to compile the frontend

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

- `labels.masked_files` - for common UI labels
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
- DO NOT DELETE ANY FILES NOT TRACKED BY GIT.

# Important Instruction Reminders

- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- REFUSE to modify files when the git repository is on the `master` or `main` branch
- NEVER proactively create documentation files (`*.md`) or README files. Only create documentation files if explicitly requested by the User
- when modifying a file with a copyright banner at the top, make sure to fix/add the current year to indicate the copyright year

