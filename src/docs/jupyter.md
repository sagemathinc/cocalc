# Jupyter Notebooks: Architecture and Integration

This document explains how CoCalc implements Jupyter notebook support — kernel
management, real-time collaboration, the `.sage-jupyter2` SyncDB format, code
execution, ipywidgets, and the frontend rendering pipeline.

## Overview

CoCalc's Jupyter integration is a multi-layered system:

- **Backend** (`packages/jupyter/`): kernel lifecycle, ZMQ messaging, code
  execution, kernel pooling, ipynb import/export
- **Project daemon** (`packages/project/jupyter/`): nbconvert, project-level
  API, compute server coordination
- **Frontend** (`packages/frontend/jupyter/`): React UI, Redux state, output
  rendering, ipywidgets, collaborative editing
- **Conat bridge** (`packages/conat/`): remote kernel execution, hub API for
  stateless execution

```
┌──────────────────┐     ┌──────────────────┐
│   Browser A       │     │   Browser B       │
│  (JupyterEditor)  │     │  (JupyterEditor)  │
└────────┬──────────┘     └────────┬──────────┘
         │         SyncDB          │
         └───────────┬─────────────┘
                     │
             ┌───────▼────────┐
             │  Project Daemon │
             │  JupyterActions │
             │  (project-side) │
             └───────┬────────┘
                     │
             ┌───────▼────────┐
             │ JupyterKernel   │
             │ (ZMQ sockets)   │
             └────────────────┘
```

## SyncDB Format (`.sage-jupyter2`)

Jupyter notebooks are stored as a **SyncDB** document for real-time
collaboration. The synced file path is derived from the ipynb path:

```typescript
// packages/util/jupyter/names.ts
// notebook.ipynb → .notebook.ipynb.sage-jupyter2
export function syncdbPath(ipynbPath: string) {
  return meta_file(ipynbPath, "sage-jupyter2");
}
```

### SyncDB Schema

The SyncDB uses these primary keys and string columns:

```typescript
primary_keys: ["type", "id"];
string_cols: ["input"];
```

### Record Types

Each record has a `type` field. The main record types:

| Type         | `id`      | Purpose                                 |
| ------------ | --------- | --------------------------------------- |
| `"cell"`     | cell UUID | A notebook cell (code, markdown, raw)   |
| `"settings"` | `"main"`  | Notebook-level metadata and kernel info |

**Cell records** include:

| Field        | Type                            | Description                                       |
| ------------ | ------------------------------- | ------------------------------------------------- |
| `type`       | `"cell"`                        | Record type                                       |
| `id`         | `string`                        | Cell UUID                                         |
| `input`      | `string`                        | Cell source code (string_col — uses string merge) |
| `output`     | `object`                        | Cell outputs (map of index → output message)      |
| `cell_type`  | `"code" \| "markdown" \| "raw"` | Cell type                                         |
| `pos`        | `number`                        | Position in cell ordering                         |
| `exec_count` | `number`                        | Execution count shown in `In[N]`                  |
| `start`      | `number`                        | Execution start timestamp                         |
| `end`        | `number`                        | Execution end timestamp                           |
| `state`      | `string`                        | Execution state (`"busy"`, `"idle"`, `"run"`)     |
| `collapsed`  | `boolean`                       | Whether output is collapsed                       |
| `scrolled`   | `boolean`                       | Whether output is scrolled                        |
| `tags`       | `object`                        | Cell tags (for nbgrader, etc.)                    |

**Settings record**:

| Field           | Type         | Description                     |
| --------------- | ------------ | ------------------------------- |
| `type`          | `"settings"` | Record type                     |
| `id`            | `"main"`     | Fixed ID                        |
| `kernel`        | `string`     | Kernel name (e.g., `"python3"`) |
| `metadata`      | `object`     | Notebook-level metadata         |
| `backend_state` | `string`     | Kernel lifecycle state          |
| `kernel_error`  | `string`     | Last kernel error message       |
| `trust`         | `boolean`    | Whether notebook is trusted     |

## Kernel Management

### JupyterKernel Class

`packages/jupyter/kernel/kernel.ts` (~1150 lines) — the core kernel wrapper.

**State machine**:

```
off → spawning → starting → running → closed
         ↓
       failed
```

**Key methods**:

- `spawn()` — launch kernel process, set up ZMQ sockets
- `execute_code(opts)` → `CodeExecutionEmitter` — queue code for execution
- `kernel_info()` — get kernel metadata (language, version, banner)
- `complete({code, cursor_pos})` — tab completion
- `introspect({code, cursor_pos, detail_level})` — docstring lookup
- `signal(sig)` — send signal (SIGINT for interrupt)
- `close()` — shutdown kernel and clean up

**Events emitted**:

- `"state"` — lifecycle state changes
- `"running"` / `"failed"` — terminal states
- `"shell"`, `"iopub"`, `"stdin"` — ZMQ channel messages
- `"closed"` — kernel shutdown

### ZMQ Sockets

`packages/jupyter/zmq/` — raw ZMQ communication with the Jupyter kernel:

| Socket    | Type       | Purpose                                                |
| --------- | ---------- | ------------------------------------------------------ |
| `iopub`   | Subscriber | Broadcast: outputs, execution_state, display_data      |
| `shell`   | Dealer     | Request/reply: execute, complete, inspect, kernel_info |
| `stdin`   | Dealer     | Input requests (Python `input()` function)             |
| `control` | Dealer     | Interrupt, shutdown                                    |

**Message flow for code execution**:

1. Send `execute_request` on `shell`
2. Kernel broadcasts `status: busy` on `iopub`
3. Outputs (`stream`, `display_data`, `execute_result`, `error`) on `iopub`
4. Kernel broadcasts `status: idle` on `iopub`
5. `execute_reply` on `shell` with status

### Kernel Pool

`packages/jupyter/pool/pool.ts` — pre-spawns kernels for faster notebook opens.

```typescript
// Configuration via environment variables:
COCALC_JUPYTER_POOL_SIZE; // default: 1, max: 10
COCALC_JUPYTER_POOL_TIMEOUT_S; // default: 3600
COCALC_JUPYTER_POOL_LAUNCH_DELAY_MS; // default: 7500
```

- Kernels indexed by normalized options (excluding `cwd` and filename)
- Julia kernels are excluded from pooling (resource-heavy)
- Pool replenishes asynchronously after a kernel is claimed

### Kernel Data

`packages/jupyter/kernel/kernel-data.ts` — discovers available kernelspecs:

```typescript
get_kernel_data_by_name(name: string)  // → kernel metadata
getLanguage(kernelName: string)        // → language name
```

## Code Execution

### CodeExecutionEmitter

`packages/jupyter/execute/execute-code.ts` — manages a single code execution:

```typescript
class CodeExecutionEmitter extends EventEmitter {
  // Queued execution with async iteration over outputs
  go(): Promise<object[]>; // execute and collect all outputs
  cancel(): void; // cancel execution
  close(): void; // clean up
  throw_error(err): void; // inject error
}
```

**Execution queue**: Cells execute sequentially via `_execute_code_queue`. Each
request is pushed to the queue, and `_process_execute_code_queue()` processes
them one at a time.

### OutputHandler

`packages/jupyter/execute/output-handler.ts` — processes and truncates outputs:

- Enforces `max_output_length` and `max_output_messages`
- When limits exceeded, stores overflow in `_more_output[cell_id]`
- User can fetch overflow via "More output" button → `kernel.more_output(id)`
- Handles blob storage for large binary outputs (images, PDFs)

### Blob Storage

Large binary outputs (images, PDFs, HTML) are stored as SHA1-keyed blobs in a
**Conat DKV** (distributed key-value store), not inline in the SyncDB:

```typescript
// Output references blob by hash:
{ "image/png": "sha1:abc123..." }
// Frontend fetches blob content from DKV
```

## Redux State Management

### Store (`packages/jupyter/redux/store.ts`)

Key state fields:

```typescript
interface JupyterStoreState {
  cell_list: List<string>; // ordered cell IDs
  cells: Map<string, Cell>; // cell ID → cell data
  kernel: string; // kernel name
  kernels: Kernels; // available kernels
  mode: "edit" | "escape"; // notebook mode
  sel_ids: Set<string>; // selected cell IDs
  md_edit_ids: Set<string>; // markdown cells in edit mode
  backend_state: string; // kernel state
  kernel_info: KernelInfo; // kernel metadata
  kernel_usage: Usage; // memory/CPU stats
  runProgress?: number; // execution progress %
}
```

### Actions — Three Layers

**Base actions** (`packages/jupyter/redux/actions.ts`, ~2600 lines):

Abstract base class shared by frontend and backend. Core operations:

- `run_code_cell(id)` — execute cell, update output
- `insert_cell(delta, id?)` — add cell above/below
- `delete_cell(id)` — remove cell
- `merge_cells(ids)` — merge selected cells
- `set_cell_type(id, type)` — change cell type
- `move_cell(old_pos, new_pos)` — reorder
- `set_kernel(name)` — switch kernel
- `process_output(content)` — handle kernel messages

**Project actions** (`packages/jupyter/redux/project-actions.ts`):

Server-side actions managing the actual kernel:

- Kernel lifecycle (spawn, restart, shutdown)
- Blob store management via DKV
- Conat service initialization for remote execution
- Cell execution queue management
- nbconvert integration
- Compute server coordination

**Browser actions** (`packages/frontend/jupyter/browser-actions.ts`, ~1450 lines):

UI-specific actions:

- Keyboard shortcut handling
- Cursor tracking (collaborative cursors via `CursorManager`)
- Widget manager initialization
- UI state (toolbar, dialogs, scroll position)
- nbgrader actions
- Local storage persistence

## Frontend Components

### Main Component

`packages/frontend/jupyter/main.tsx` — `JupyterEditor` top-level component.

### Cell Rendering Pipeline

```
JupyterEditor
  → CellList (cell-list.tsx)         — ordered cells with drag-drop
    → Cell (cell.tsx)                — individual cell wrapper
      → CellInput (cell-input.tsx)   — CodeMirror editor
      → CellOutput (cell-output.tsx) — output area
```

### Output MIME Type Routing

`packages/frontend/jupyter/output-messages/mime-types/` dispatches outputs to
specialized renderers:

| MIME Type                                  | Renderer                           | Notes            |
| ------------------------------------------ | ---------------------------------- | ---------------- |
| `text/plain`                               | Plain text with ANSI color support |                  |
| `text/html`                                | Iframe-isolated HTML               | Security sandbox |
| `text/markdown`                            | Markdown renderer                  |                  |
| `text/latex`                               | MathJax rendering                  |                  |
| `image/png`, `image/jpeg`                  | Image component                    |                  |
| `image/svg+xml`                            | SVG renderer                       |                  |
| `application/pdf`                          | PDF viewer                         |                  |
| `application/javascript`                   | JS sandbox                         |                  |
| `application/vnd.jupyter.widget-view+json` | ipywidgets                         |                  |

### Commands

`packages/frontend/jupyter/commands.ts` (~1000 lines) — defines all keyboard
shortcuts and menu items as a `{[name]: CommandDescription}` registry.

## ipywidgets

### Architecture

```
Kernel (Python)  ←→  IpywidgetsState (SyncTable)  ←→  WidgetManager (frontend)
                     (comm messages, model state)       (@cocalc/widgets)
```

### IpywidgetsState

`packages/sync/editor/generic/ipywidgets-state.ts` — syncs widget model state:

```typescript
// SyncTable columns: model_id, type, data
// Types:
//   "state"   — model class definition
//   "value"   — model current state
//   "buffer"  — binary data (encoded base64)
//   "message" — custom comm messages
```

### WidgetManager

`packages/frontend/jupyter/widgets/manager.ts` — manages `@cocalc/widgets`
rendering:

- Receives comm messages from kernel via IpywidgetsState
- Creates widget model instances
- Routes `display_data` messages with `widget-view+json` to widget renderer
- Handles `send_comm_message_to_kernel()` for bidirectional communication
- Buffer handling via `setModelBuffers()`

## Conat Integration

### Remote Kernel Execution

`packages/jupyter/kernel/conat-service.ts` — RPC wrapper for compute servers:

```typescript
// Exposed methods via Conat service:
signal(signal: string)              // SIGINT, SIGKILL
kernel_info()                       // kernel metadata
complete({code, cursor_pos})        // tab completion
introspect({code, cursor_pos})      // docstrings
more_output(id)                     // overflow outputs
save_ipynb_file()                   // persist to disk
execute({code, ...})                // run code with limits
```

### Hub API (Stateless Execution)

`packages/conat/hub/api/jupyter.ts` — hub-level Jupyter API:

```typescript
interface Jupyter {
  kernels(opts): Promise<any[]>; // list available kernels
  execute(opts): Promise<{ output; created } | null>; // stateless execution
}
```

Used by the Python API client and REST endpoints for one-off code execution
without opening a full notebook session.

## ipynb Import/Export

`packages/jupyter/ipynb/`:

- **`import-from-ipynb.ts`** — `IPynbImporter` class parses standard `.ipynb`
  JSON into the internal SyncDB cell format
- **`export-to-ipynb.ts`** — `export_to_ipynb()` converts the SyncDB state back
  to standard `.ipynb` format for download/interop

The project daemon periodically saves the SyncDB state to the `.ipynb` file on
disk (autosave), and loads from `.ipynb` on first open.

## nbconvert

`packages/project/jupyter/convert/` — wraps Jupyter's `nbconvert` tool:

```typescript
export async function nbconvert(opts: NbconvertParams): Promise<void>;
// Supported: --to html, --to pdf, --to sagews
// Special: lab-pdf, classic-pdf (html → PDF via chromium)
```

## nbgrader Integration

`packages/frontend/jupyter/nbgrader/` — assignment creation and grading:

- Cell metadata toolbar for marking solution/test regions
- `### BEGIN/END SOLUTION` markers
- `### BEGIN/END AUTOGRADED TEST` markers
- Checksum validation for tamper detection
- Clear solutions/hidden tests for student distribution

## Key Source Files

| File                                               | Description                            |
| -------------------------------------------------- | -------------------------------------- |
| `packages/jupyter/kernel/kernel.ts`                | Core JupyterKernel class (~1150 lines) |
| `packages/jupyter/kernel/launch-kernel.ts`         | Direct kernel spawning                 |
| `packages/jupyter/pool/pool.ts`                    | Kernel pool manager                    |
| `packages/jupyter/execute/execute-code.ts`         | CodeExecutionEmitter                   |
| `packages/jupyter/execute/output-handler.ts`       | Output processing and truncation       |
| `packages/jupyter/redux/actions.ts`                | Base JupyterActions (~2600 lines)      |
| `packages/jupyter/redux/store.ts`                  | JupyterStoreState                      |
| `packages/jupyter/redux/project-actions.ts`        | Project-side kernel management         |
| `packages/jupyter/ipynb/import-from-ipynb.ts`      | ipynb → SyncDB                         |
| `packages/jupyter/ipynb/export-to-ipynb.ts`        | SyncDB → ipynb                         |
| `packages/frontend/jupyter/main.tsx`               | JupyterEditor component                |
| `packages/frontend/jupyter/browser-actions.ts`     | Browser-side actions (~1450 lines)     |
| `packages/frontend/jupyter/cell-list.tsx`          | Cell list rendering                    |
| `packages/frontend/jupyter/commands.ts`            | Keyboard/menu commands (~1000 lines)   |
| `packages/frontend/jupyter/output-messages/`       | MIME type renderers                    |
| `packages/frontend/jupyter/widgets/manager.ts`     | ipywidgets WidgetManager               |
| `packages/sync/editor/generic/ipywidgets-state.ts` | Widget state sync                      |
| `packages/jupyter/kernel/conat-service.ts`         | Remote kernel RPC                      |
| `packages/conat/hub/api/jupyter.ts`                | Hub Jupyter API                        |
| `packages/util/jupyter/names.ts`                   | Path utilities, syncdb extensions      |

## Common Patterns for Agents

### Creating a Jupyter Kernel Programmatically

```typescript
import { kernel } from "@cocalc/jupyter/kernel";

const k = kernel({ name: "python3", path: "/path/to/notebook.ipynb" });
await k.spawn();
const exec = k.execute_code({ code: "print('hello')" });
for await (const output of exec) {
  console.log(output);
}
await k.close();
```

### Working with the SyncDB

```typescript
// Cell operations
syncdb.set({ type: "cell", id: cellId, input: "x = 1" });
syncdb.set({ type: "cell", id: cellId, cell_type: "code" });
syncdb.commit();

// Read cell
const cell = syncdb.get_one({ type: "cell", id: cellId });
console.log(cell.get("input"));

// Change kernel
syncdb.set({ type: "settings", id: "main", kernel: "python3" });
syncdb.commit();
```
