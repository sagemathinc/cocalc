# CLAUDE.md and GEMINI.md

This file provides guidance to Claude Code (claude.ai/code) and also Gemini CLI (https://github.com/google-gemini/gemini-cli) when working with code in this repository.

# CoCalc Source Repository

- This is the source code of CoCalc in a Git repository
- It is a complex JavaScript/TypeScript SaaS application
- CoCalc is organized as a monorepository (multi-packages) in the subdirectory "./src/packages"
- The packages are managed as a pnpm workspace in "./src/packages/pnpm-workspace.yaml"

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
- **CSS/Styling**: Prefer SASS files over inline React `<style>` tags or style objects for reusable styles. The SASS entry point is `src/packages/frontend/index.sass`, which `@use`s partial files (e.g. `@use 'frame-editors/llm/_ai-assistant' as ai-assistant`). Color variables from `_colors.sass` are available as `colors.$COL_...`. Use CSS class names (e.g. `className="cc-my-component"`) in components instead of inline style objects when the styles are non-trivial or conditional.
- **Backend Logging**: Use `getLogger` from `@cocalc/project/logger` for logging in backend code. Do NOT use `console.log`. Example: `const L = getLogger("module:name").debug;`

## Development Commands

### Essential Commands

- `pnpm build-dev` - Build all packages for development
- `pnpm clean` - Clean all `node_modules` and `dist` directories
- `pnpm test` - Run full test suite
- `pnpm depcheck` - Check for dependency issues
- `python3 ./src/scripts/check_npm_packages.py` - Check npm package consistency across packages
- `prettier -w [filename]` to format the style of a file after editing it
- After creating a file, run `git add [filename]` to start tracking it

### Package-Specific Commands

- `cd src/packages/[package] && pnpm build` - Build and compile a specific package
  - For src/packages/next and src/packages/static, run `cd src/packages/[package] && pnpm build-dev`
- `cd src/packages/[package] && pnpm test` - Run all tests for a specific package
- `cd src/packages/[package] && pnpm test -- [path/to/file.test.ts]` - Run a single test file (preferred — faster than running the full suite)
- **IMPORTANT**: When modifying packages like `util` that other packages depend on, you must run `pnpm build` in the modified package before typechecking dependent packages
- **IMPORTANT**: When modifying colors in `src/packages/util/theme.ts`, run `cd src/packages/frontend && pnpm update-color-scheme` to regenerate the SASS color variables in `src/packages/frontend/_colors.sass`

### Workspace Management (`src/workspaces.py`)

The root-level `src/workspaces.py` script orchestrates operations across all packages in the monorepo. Use it instead of running raw pnpm commands when working across the workspace:

- `python3 src/workspaces.py install` - Install dependencies for all packages (use after updating package.json files)
- `python3 src/workspaces.py build` - Build all packages that have changed
- `python3 src/workspaces.py clean` - Delete dist and node_modules folders
- `python3 src/workspaces.py version-check` - Check dependency version consistency across all packages
- `python3 src/workspaces.py test` - Run tests for all packages

**IMPORTANT**: After updating dependencies in any `package.json`, run `python3 src/workspaces.py version-check` to ensure consistency, then `python3 src/workspaces.py install` to update the lockfile and install.

### Development

- **IMPORTANT**: In tests and code comments, use only generic names, email addresses, and company names. Do not include customer or real-world identifiers, except for `Sagemath, Inc.` or when the developer explicitly says otherwise.

#### Verification Steps (MUST run before reporting completion or committing)

After finishing a batch of code edits, you MUST run these steps automatically — do not wait for the user to ask.

**Frontend code** (`src/packages/frontend`):

1. `prettier -w [each edited file]`
2. `cd src/packages/frontend && pnpm tsc --noEmit` — fix any errors before continuing
3. `cd src/packages/static && pnpm build-dev` — compile for testing
4. **DO NOT** run `pnpm build` in `src/packages/frontend` — it won't work for frontend dev.

**Other packages**:

1. `prettier -w [each edited file]`
2. `cd src/packages/[package] && pnpm build` — build the modified package
3. If the package is a dependency (e.g. `util`), build it before typechecking dependents.

**Special cases**:

- After editing colors in `src/packages/util/theme.ts`: run `cd src/packages/frontend && pnpm update-color-scheme`
- After updating `package.json` deps: run `python3 src/workspaces.py version-check` then `python3 src/workspaces.py install`

## Architecture Overview

For detailed architecture documentation, see [`src/docs/`](src/docs/README.md):

- [System Overview](src/docs/overview.md) — High-level architecture and data flow
- [Frontend](src/docs/frontend.md) — React app, state management, client layer
- [Conat](src/docs/conat.md) — Messaging system: DKV, PubSub, request/response
- [Hub & Server](src/docs/hub.md) — Central server, API dispatch, database
- [Next.js](src/docs/next.md) — SSR pages, REST API routes, conat bridge
- [External API](src/docs/api.md) — Python client, HTTP endpoints, call flow
- [Project Daemon](src/docs/project.md) — Per-project services and conat integration

### Package Structure

CoCalc is organized as a monorepo with key packages:

- **frontend** - React/TypeScript frontend application using Redux-style stores and actions
- **backend** - Node.js backend services and utilities
- **hub** - Main server orchestrating the entire system
- **database** - PostgreSQL database layer with queries and schema
- **util** - Shared utilities and types used across packages
- **comm** - Communication layer including WebSocket types
- **conat** - Distributed messaging system (NATS-like pub/sub, DKV, request/response)
- **sync** - Real-time synchronization system for collaborative editing
- **project** - Project-level services and management
- **static** - Static assets and build configuration
- **server** - Server-side service implementations (LLM, purchases, conat API handlers)
- **ai** - AI/LLM integration utilities
- **jupyter** - Jupyter notebook kernel and execution support
- **terminal** - Terminal emulation and pty management
- **compute** - Compute server orchestration (on-prem and cloud)
- **next** - Next.js server components

### Key Architectural Patterns

#### Frontend Architecture

- **Redux-style State Management**: Uses custom stores and actions pattern (see `src/packages/frontend/app-framework/actions-and-stores.ts`)
- **TypeScript React Components**: All frontend code is TypeScript with proper typing
- **Modular Store System**: Each feature has its own store/actions (AccountStore, BillingStore, etc.)
- **WebSocket Communication**: Real-time communication with backend via WebSocket messages
- **Authentication Waiting**: When frontend code needs to wait for user authentication, use `redux.getStore("account").async_wait({ until: () => store.get_account_id() != null, timeout: 0 })` to wait indefinitely until authentication completes
- **Conat DKV Usage**: For key-value storage with real-time sync, use `webapp_client.conat_client.dkv({ account_id, name: "store-name" })` to get a distributed key-value store that syncs across sessions

#### Backend Architecture

- **PostgreSQL Database**: Primary data store with sophisticated querying system
- **WebSocket Messaging**: Real-time communication between frontend and backend
- **Conat System**: Distributed messaging (pub/sub, DKV, request/response)
- **Event-Driven Architecture**: Extensive use of EventEmitter patterns
- **Microservice-like Packages**: Each package handles specific functionality
- **Database Access**: Use `getPool()` from `@cocalc/database/pool` for direct database queries in hub/backend code. Example: `const pool = getPool(); const { rows } = await pool.query('SELECT * FROM table WHERE id = $1', [id]);`
- **Hub Migration Functions**: Migration functions in hub should be designed to run once at startup, use batch processing with delays between batches to avoid database saturation

#### Communication Patterns

- **WebSocket Messages**: Primary communication method (see `src/packages/comm/websocket/types.ts`)
- **Database Queries**: Structured query system with typed interfaces
- **Event Emitters**: Inter-service communication within backend
- **REST-like APIs**: Some HTTP endpoints for specific operations
- **API Schema**: API endpoints in `src/packages/next/pages/api/v2/` use Zod schemas in `src/packages/next/lib/api/schema/` for validation. These schemas must be kept in harmony with the TypeScript types sent from frontend applications using `apiPost` (in `src/packages/next/lib/api/post.ts`) or `api` (in `src/packages/frontend/client/api.ts`). When adding new fields to API requests, both the frontend types and the API schema validation must be updated.
- **Conat Messaging**: Frontend-to-hub communication via conat pub/sub — see [Conat docs](src/docs/conat.md) for the full message flow, subjects, and API registration pattern.

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

- Comprehensive schema in `src/packages/util/db-schema`
- Query abstractions in `src/packages/database/postgres/`
- Type-safe database operations with TypeScript interfaces

### Testing

- **Jest**: Primary testing framework
- **ts-jest**: TypeScript support for Jest
- **jsdom**: Browser environment simulation for frontend tests
- Test files use `.test.ts` or `.spec.ts` extensions
- Each package has its own jest.config.js
- **Playwright MCP**: For interactive browser testing of the frontend UI, see [`src/packages/frontend/test/agent-playwright-testing.md`](src/packages/frontend/test/agent-playwright-testing.md) — covers the dev server setup, build-test loop, UI layout, and testing patterns for the file explorer and flyout panels. Always ask the developer for current dev account credentials.

### Import Patterns

- Use absolute imports with `@cocalc/` prefix for cross-package imports
- Example: `import { cmp } from "@cocalc/util/misc"`
- Type imports: `import type { Foo } from "./bar"`
- Destructure imports when possible

### Development Workflow

1. Follow the **Verification Steps** in the Development Commands section above after every batch of edits.
2. Database must be running before starting hub
3. Hub coordinates all services and should be restarted after changes
4. Use `pnpm clean && pnpm build-dev` when switching branches or after major changes

# Workflow

- Prefer running single tests, and not the whole test suite, for performance

## Git Workflow

- Never modify a file when in the `master` or `main` branch
- All changes happen through feature branches, which are pushed as pull requests to GitHub
- When creating a new file, run `git add [filename]` to track the file.
- The first line of a commit message must follow the pattern: `[package]/[region]: [1-line description]`. e.g. `frontend/latex: fix PDF preview sync` or `frontend/frame-editor: add drag-and-drop support`. The package is the subdirectory under `src/packages/` and the region is the feature area within that package.
- When pushing a new branch to Github, track it upstream. e.g. `git push --set-upstream origin feature-foo` for branch "feature-foo".
- **Branch naming**: New branches should follow the pattern `[some-key-words]-[issue-number]`. e.g. `fix-invite-email-signup-link-8757` for issue #8757.

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

1. Add the translation to source code (e.g., `src/packages/frontend/i18n/common.ts`)
2. Run `pnpm i18n:extract` - updates `extracted.json` from source code
3. Run `pnpm i18n:upload` - sends new strings to SimpleLocalize
4. New keys are automatically translated to all languages
5. Run `pnpm i18n:download` - fetches translations
6. Run `pnpm i18n:compile` - compiles translation files

**For editing existing translation keys:**
Same flow as above, but **before 3. i18n:upload**, delete the key. Only new keys are auto-translated. `pnpm i18n:delete [id]`.

### Translation File Structure

- `src/packages/frontend/i18n/README.md` - detailed documentation
- `src/packages/frontend/i18n/common.ts` - shared translation definitions (labels, menus, editor, jupyter, etc.)
- `src/packages/frontend/i18n/extracted.json` - auto-extracted messages from source code
- `src/packages/frontend/i18n/trans/[locale].json` - downloaded translations from SimpleLocalize
- `src/packages/frontend/i18n/trans/[locale].compiled.json` - compiled translation files for runtime
- `src/packages/frontend/i18n/index.ts` - exports and locale loading logic

# Ignore

- Ignore files covered by `.gitignore`
- Ignore everything in `node_modules` or `dist` directories
- Ignore all files not tracked by Git, unless they are newly created files

# CoCalc Python API Client

For architecture and development details, see [`src/python/cocalc-api/`](src/python/cocalc-api/DEVELOPMENT.md).

# important-instruction-reminders

- Do what has been asked; nothing more, nothing less.
- ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
- ALWAYS ask questions if something is unclear. Only proceed to the implementation step if you have no questions left.
- When modifying a file with a copyright banner at the top, make sure to fix/add the current year to indicate the copyright year.
