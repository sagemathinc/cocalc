# File System and Terminals

This document explains how CoCalc handles file operations (read, write, listing,
watching) and terminal sessions — the Conat service layer, the project daemon
backend, and the frontend integration.

## Overview

File operations and terminals both follow the same pattern: the **frontend**
sends requests via **Conat** to the **project daemon**, which executes them on
the local filesystem or PTY.

```
┌──────────┐     Conat RPC      ┌──────────────┐     ┌───────────┐
│  Browser  │ ◄──────────────► │ Project Daemon│ ◄── │ Filesystem│
│           │                   │              │     │ / PTY     │
└──────────┘                   └──────────────┘     └───────────┘
```

## File Operations

### System API

`packages/conat/project/api/system.ts` defines the project-level file API:

```typescript
interface System {
  listing(opts: {
    path: string;
    hidden?: boolean;
  }): Promise<DirectoryListingEntry[]>;
  deleteFiles(opts: { paths: string[] }): Promise<void>;
  moveFiles(opts: { paths: string[]; dest: string }): Promise<void>;
  renameFile(opts: { src: string; dest: string }): Promise<void>;
  realpath(path: string): Promise<string>;
  canonicalPaths(paths: string[]): Promise<string[]>;
  writeTextFileToProject(opts: {
    path: string;
    content: string;
  }): Promise<void>;
  readTextFileFromProject(opts: { path: string }): Promise<string>;
  exec(opts: ExecuteCodeOptions): Promise<ExecuteCodeOutput>;
  // ...
}
```

### Streaming File Read/Write

For large files, CoCalc uses streaming via Conat `requestMany`:

**Read** (`packages/conat/files/read.ts`):

```typescript
// Memory-efficient async generator for reading files
async function* readFile({
  project_id,
  compute_server_id,
  path,
}): AsyncGenerator<Buffer> {
  // Sends request, receives chunked binary data via Conat multiresponse
}
```

**Write** (`packages/conat/files/write.ts`):

```typescript
// Streaming write — sends file data in chunks
async function writeFile({
  project_id,
  compute_server_id,
  path,
  data, // Buffer or async iterable
}): Promise<void>;
```

These streaming APIs are used for:

- HTTP download endpoints (serving files to browsers)
- Copying files between projects
- Large file transfers to/from compute servers

### Copy Between Projects

File copying between projects (used by course assignments, etc.) uses
`webapp_client.project_client.copy_path_between_projects()`, which coordinates
Conat streaming between source and destination project daemons.

## Directory Listings

### Architecture

Directory listings use an **interest-based** watching system:

```
Browser expresses interest → Listings service watches directory
                          → DKV stores listing data
                          → MultipathWatcher monitors filesystem
                          → Changes update DKV
                          → Browser receives updates via DKV sync
```

### Key Components

**Service** (`packages/conat/service/listings.ts`):

```typescript
interface ListingsApi {
  watch(path: string): Promise<void>; // express interest in a directory
}

const MAX_FILES_PER_DIRECTORY = 500; // first N files by recency
const INTEREST_CUTOFF_MS = 600_000; // stop watching after 10min of no interest
```

**Project implementation** (`packages/project/conat/listings.ts`):

- `Listings` class manages watched directories
- Uses `MultipathWatcher` (`@cocalc/backend/path-watcher`) for filesystem events
- Stores results in a **DKV** (distributed key-value store):
  - Keys: directory paths
  - Values: `DirectoryListingEntry[]` (first ~300 files, sorted by recency)
- Separate DKV for modification times

**Frontend** consumes the DKV for real-time file browser updates.

### DirectoryListingEntry

```typescript
// packages/util/types
interface DirectoryListingEntry {
  name: string;
  size?: number;
  mtime?: number; // modification timestamp
  isdir?: boolean;
  issymlink?: boolean;
  error?: string;
}
```

## Terminals

### Architecture

```
┌──────────────────┐     DStream      ┌──────────────┐
│  Browser          │ ◄────────────► │ Project Daemon│
│  xterm.js         │                 │ node-pty      │
│  (Terminal class)  │   Conat RPC    │ (Session)     │
│  (ConatTerminal)  │ ◄────────────► │               │
└──────────────────┘                 └──────────────┘
```

Two communication channels:

1. **DStream** — streaming terminal I/O (character data)
2. **Conat RPC** — control commands (create, resize, kill)

### Backend: Session

`packages/project/conat/terminal/session.ts` — the server-side terminal:

```typescript
class Session {
  state: "running" | "off" | "closed";
  private pty; // node-pty spawned process
  private stream: DStream<string>; // output stream
  private browserApi; // RPC client to send commands to browsers
  // ...
}
```

**Key properties**:

- Uses `@lydell/node-pty` for PTY management
- Default command: `/bin/bash`
- Input truncation: `MAX_INPUT_SIZE = 10000` (prevents paste-bomb crashes)
- Output throttling: configurable bytes/sec and messages/sec
- History limit: `COCALC_TERMINAL_HISTORY_LIMIT_BYTES` (default: 1MB)

**Environment variables**:

```
COCALC_TERMINAL_HISTORY_LIMIT_BYTES  // default: 1000000
COCALC_TERMINAL_MAX_BYTES_PER_SECOND // default: 1000000
COCALC_TERMINAL_MAX_MSGS_PER_SECOND  // default: 24
```

### Backend: Manager

`packages/project/conat/terminal/manager.ts` — manages terminal sessions:

- Creates/destroys terminal sessions on demand
- Routes Conat service requests to the appropriate session
- Handles terminal path naming

### Conat Service API

`packages/conat/service/terminal.ts` — defines the RPC interface:

```typescript
// Project-side API (runs in project daemon)
interface TerminalApi {
  create(opts: {
    env?: { [key: string]: string };
    command?: string;
    args?: string[];
    cwd?: string;
    ephemeral?: boolean;
  }): Promise<{ success: "ok"; note?: string; ephemeral?: boolean }>;
  write(data: string): Promise<void>;
  restart(): Promise<void>;
  cwd(): Promise<string | undefined>;
  kill(): Promise<void>;
  size(opts: { rows: number; cols: number; browser_id: string }): Promise<void>;
  close(browser_id: string): Promise<void>;
}

// Browser-side API (runs in browser)
interface TerminalBrowserApi {
  command(mesg): Promise<void>; // e.g., "open foo.txt"
  kick(sender_browser_id: string): Promise<void>;
  size(opts: { rows: number; cols: number }): Promise<void>;
}
```

Both directions use `createServiceClient` / `createServiceHandler` from
`packages/conat/service/typed.ts`.

### Frontend: Terminal Component

`packages/frontend/frame-editors/terminal-editor/` — the browser-side terminal:

**`connected-terminal.ts`** — `Terminal` class wrapping xterm.js:

```typescript
class Terminal {
  private terminal: XTerminal; // xterm.js instance
  private conatTerminal: ConatTerminal; // Conat connection
  // FitAddon, WebLinksAddon, WebglAddon
  // Scrollback: 5000 lines
  // Max history: 100 * SCROLLBACK
}
```

Features:

- xterm.js with WebGL rendering (`@xterm/addon-webgl`)
- Auto-fit to container size (`@xterm/addon-fit`)
- Clickable URLs (`@xterm/addon-web-links`)
- Paste from system clipboard
- Pause/resume output
- Theme support (multiple terminal color schemes)
- Reconnection on disconnect

**`conat-terminal.ts`** — `ConatTerminal` class managing the Conat connection:

```typescript
class ConatTerminal extends EventEmitter {
  state: "disconnected" | "init" | "running" | "closed";
  private stream: DStream<string>; // terminal I/O stream
  readonly api: TerminalServiceApi; // RPC to project
  // Heartbeat interval: 15s
  // Write queue for buffering during disconnection
}
```

**Data flow**:

1. User types → xterm.js `onData` → `ConatTerminal.write(data)`
2. `ConatTerminal` publishes to DStream
3. Project `Session` receives from DStream → writes to PTY
4. PTY output → project publishes to DStream
5. `ConatTerminal` receives from DStream → emits `"data"`
6. `Terminal` writes to xterm.js display

### Terminal Path Naming

```typescript
// packages/util/terminal/names.ts
// file.term → .file.term (hidden meta file)
// The .term extension triggers the terminal frame editor
```

Terminals are ephemeral by default (`EPHEMERAL = true`): faster, less server
load, but history is lost when both project and browser close.

### Terminal in Frame Editors

The terminal frame is defined in
`packages/frontend/frame-editors/terminal-editor/editor.ts` and can be included
in any editor spec:

```typescript
import { terminal } from "../terminal-editor/editor";

const EDITOR_SPEC = {
  cm,
  terminal, // adds terminal frame to this editor
  time_travel,
};
```

### Terminal Manager (Frontend)

`packages/frontend/frame-editors/terminal-editor/terminal-manager.ts` —
manages multiple terminal instances per editor, one per frame ID.

## Shell Execution

For non-interactive command execution (not a terminal), use the `exec` API:

```typescript
// packages/conat/project/api/system.ts
interface ExecuteCodeOptions {
  command: string;
  args?: string[];
  path?: string; // working directory
  timeout?: number; // seconds
  bash?: boolean; // run via bash
  env?: object; // environment variables
}

interface ExecuteCodeOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}
```

## Key Source Files

| File                                                                    | Description                                    |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/conat/project/api/system.ts`                                  | System API interface (listing, exec, file ops) |
| `packages/conat/files/read.ts`                                          | Streaming file read via Conat                  |
| `packages/conat/files/write.ts`                                         | Streaming file write via Conat                 |
| `packages/conat/service/terminal.ts`                                    | Terminal Conat service API                     |
| `packages/conat/service/listings.ts`                                    | Directory listings service API                 |
| `packages/project/conat/terminal/session.ts`                            | PTY session (node-pty)                         |
| `packages/project/conat/terminal/manager.ts`                            | Terminal session manager                       |
| `packages/project/conat/listings.ts`                                    | Directory watcher + DKV storage                |
| `packages/frontend/frame-editors/terminal-editor/connected-terminal.ts` | xterm.js wrapper                               |
| `packages/frontend/frame-editors/terminal-editor/conat-terminal.ts`     | Conat terminal connection                      |
| `packages/frontend/frame-editors/terminal-editor/terminal-manager.ts`   | Multi-terminal manager                         |
| `packages/frontend/frame-editors/terminal-editor/editor.ts`             | Terminal frame definition                      |
| `packages/frontend/frame-editors/terminal-editor/themes.ts`             | Terminal color themes                          |
| `packages/backend/path-watcher.ts`                                      | MultipathWatcher for filesystem events         |
| `packages/util/terminal/names.ts`                                       | Terminal path utilities                        |

## Common Patterns for Agents

### Executing a Command in a Project

```typescript
const result = await webapp_client.conat_client
  .projectApi(project_id)
  .system.exec({
    command: "ls",
    args: ["-la"],
    path: ".",
    timeout: 30,
  });
console.log(result.stdout);
```

### Reading a File

```typescript
// Small text files
const content = await webapp_client.conat_client
  .projectApi(project_id)
  .system.readTextFileFromProject({ path: "file.txt" });

// Large files (streaming)
import { readFile } from "@cocalc/conat/files/read";
for await (const chunk of await readFile({ project_id, path: "large.bin" })) {
  process(chunk);
}
```

### Getting Directory Listing

```typescript
const entries = await webapp_client.conat_client
  .projectApi(project_id)
  .system.listing({ path: ".", hidden: false });
```
