# Run Code Button for Code Editors

## Problem

Code editors in CoCalc have no "Run" button. Users editing `.py`, `.c`, `.js`, etc. must manually open a terminal and type the run command. The coding agent can compile via `exec` blocks but cannot run interactive programs.

## Design

### Run Command Table

A `RUN_COMMANDS` mapping in `code-editor/editor.ts` (alongside the existing `SHELLS` table) maps file extensions to run commands. Templates use `{file}` for the basename and `{name}` for the basename without extension.

| Extension | Command Template |
|-----------|-----------------|
| `py` | `python3 {file}` |
| `sage` | `sage {file}` |
| `js` | `node {file}` |
| `ts` | `npx ts-node {file}` |
| `c` | `gcc {file} -o ./{name} && ./{name}` |
| `cpp`, `cc` | `g++ {file} -o ./{name} && ./{name}` |
| `java` | `javac {file} && java {name}` |
| `go` | `go run {file}` |
| `rs` | `rustc {file} -o ./{name} && ./{name}` |
| `rb` | `ruby {file}` |
| `jl` | `julia {file}` |
| `r`, `R` | `Rscript {file}` |
| `sh`, `bash` | `bash {file}` |
| `pl` | `perl {file}` |
| `lua` | `lua {file}` |
| `m` | `octave {file}` |

### `run_code()` Action

New method on `CodeEditorActions`:

1. Save the file (`await this.save()`)
2. Look up `RUN_COMMANDS[ext]` — bail if no entry
3. Build the command string by substituting `{file}` and `{name}`
4. Find or create a plain terminal frame (`show_focused_frame_of_type("terminal")`)
5. Send the command: `terminal.conn_write("\x05\x15" + cmd + "\n")`

The terminal is a regular terminal frame (not a shell/REPL) so the user can interact with the running program (stdin) and see streaming output.

### Menu and Button

Register a `run_code` command in `generic-commands.tsx`:
- Group: `"build"` (reuses existing build menu infrastructure)
- Icon: `"play-circle"`
- Label: "Run"
- Visibility: only for file types present in `RUN_COMMANDS`

Add `"run_code"` to the code editor's `commands` set in `code-editor/editor.ts`. The command appears as a button in the title bar by default.

### Files to Modify

1. **`code-editor/editor.ts`** — Add `RUN_COMMANDS`, add `"run_code"` to commands set
2. **`code-editor/actions.ts`** — Add `run_code(id)` method
3. **`frame-tree/commands/generic-commands.tsx`** — Register `run_code` command

### Not in Scope

- Output capture for the coding agent (Feature B — future)
- "Stop" button (user uses Ctrl+C in the terminal)
- Custom run command configuration
- Shebang detection
