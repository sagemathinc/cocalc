# LaTeX Editor

> **Maintenance note**: Update this file when the build pipeline, SyncTeX
> integration, engine configuration, PDF viewer, or output panel changes.

Package: `packages/frontend/frame-editors/latex-editor/`

## Overview

The LaTeX editor is a frame editor that compiles `.tex`, `.rnw`, and `.rtex`
files into PDF. It supports multiple LaTeX engines, automatic detection of
SageTeX/PythonTeX/Knitr, forward/inverse search via SyncTeX, real-time build
log parsing, and a combined output panel with PDF preview.

```
┌──────────────────────────────────────────────────┐
│  Title Bar  [Source] [Output] [Build] [Terminal] │
├────────────────────────┬─────────────────────────┤
│                        │  Output Panel           │
│  CodeMirror            │  ┌─[PDF][ToC][Files]──┐ │
│  (source editor)       │  │                    │ │
│                        │  │  PDF.js preview    │ │
│                        │  │  + build controls  │ │
│                        │  └────────────────────┘ │
├────────────────────────┴─────────────────────────┤
│  Status Bar                                      │
└──────────────────────────────────────────────────┘
```

## Build Pipeline

The build pipeline is the core of the LaTeX editor. It orchestrates multiple
tools depending on what the document uses.

### Build Flow

```
build()
  │
  ├─ save_all()              ← save all open related files
  │
  ├─ [if .rnw/.rtex] run_knitr()     ← R/Knitr: .rnw → .tex
  │
  ├─ run_latex()             ← latexmk: .tex → .pdf  (with -synctex=1)
  │
  ├─ [if .rnw/.rtex] run_patch_synctex()  ← fix line numbers for Knitr
  │
  ├─ [if sagetex detected]
  │    ├─ ensure_output_directory_disabled()
  │    ├─ run_latex() again   ← rebuild without output dir
  │    └─ run_sagetex()       ← sage .sagetex.sage
  │
  ├─ [if pythontex detected]
  │    ├─ ensure_output_directory_disabled()
  │    ├─ run_latex() again
  │    └─ run_pythontex()     ← pythontex3
  │
  └─ update_pdf()            ← reload PDF in viewer
```

**Detection**: SageTeX and PythonTeX are detected by scanning the LaTeX build
log (`stdout`) for `sagetex.sty` or `pythontex.sty`/`PythonTeX` references.
When detected, the output directory is disabled (these tools need to run in
the source directory), and the build command is updated accordingly.

### Build Coordination

Builds are coordinated across multiple collaborators via `BuildCoordinator`
(`packages/frontend/frame-editors/generic/build-coordinator.ts`). This uses
an ephemeral DKV (distributed key-value store) per project to deduplicate
builds — when one client starts a build, others join the running build
instead of starting their own.

### Build-on-Save

When `editor_settings.build_on_save` is enabled (default: true), the editor
automatically triggers a build on file save. This is set up in `init_latexmk()`
which listens to `save-to-disk` events on the SyncString. Included files
(via `\input{}`) delegate to the parent master file's build.

## LaTeX Engines

Location: `latexmk.ts`

The editor uses `latexmk` as the build tool, configured for different engines:

| Engine                     | latexmk flag | Description                             |
| -------------------------- | ------------ | --------------------------------------- |
| `PDFLaTeX`                 | `-pdf`       | Default engine                          |
| `PDFLaTeX (no output dir)` | `-pdf`       | Without output directory                |
| `PDFLaTeX (shell-escape)`  | `-pdf`       | With `-shell-escape` (for minted, etc.) |
| `XeLaTeX`                  | `-xelatex`   | Unicode/OpenType fonts                  |
| `XeLaTeX (no output dir)`  | `-xelatex`   | Without output directory                |
| `LuaTex`                   | `-lualatex`  | Lua scripting support                   |
| `LuaTex (no output dir)`   | `-lualatex`  | Without output directory                |
| `<disabled>`               | `false;`     | Disable automatic builds                |

### Default Build Command

```
latexmk -pdf -f -g -bibtex -deps -synctex=1 -interaction=nonstopmode
        [-output-directory=/tmp/<sha1(path)>] '<filename>.tex'
```

Key flags:

- `-f` — force build even with errors
- `-g` — ignore heuristics (needed for sagetex)
- `-bibtex` — run bibtex when needed
- `-deps` — output dependency list (used for `\input{}` file tracking)
- `-synctex=1` — generate SyncTeX data for forward/inverse search
- `-interaction=nonstopmode` — don't stop on errors

### Output Directory

By default, builds run in `/tmp/<sha1(path)>` to keep the source directory
clean. This is disabled for:

- Knitr files (always build in source directory)
- SageTeX/PythonTeX (need access to source-relative paths)
- User-selected `(no output dir)` engine variants

After building, the PDF is copied from the output directory to the source
directory.

### Build Command Configuration

Build commands can be set in three ways (in priority order):

1. **`% !TeX cocalc = <command>`** — hardcoded command in the document (highest priority)
2. **`% !TeX program = <engine>`** — standard TeX directive (scanned in first 1000 lines)
3. **SyncDB setting** — stored in the shared config and editable via the Build panel

The build command is stored in a SyncDB (auxiliary `.syncdoc` file) so it's
shared between collaborators.

## Computational LaTeX

### Knitr (R)

Location: `knitr.ts`
File extensions: `.rnw`, `.rtex`

Knitr documents embed R code in LaTeX. The build pipeline:

1. Run `R --no-save --no-restore --quiet -e 'require(knitr); knit("file.rnw")'`
2. This produces a `.tex` file
3. Run latexmk on the generated `.tex` file
4. Run `patchSynctex` to fix line numbers (maps `.tex` lines back to `.rnw`)

Knitr errors are parsed from `stderr` — looks for `"Error"` lines and
`"Quitting from lines N-M"` patterns to extract line numbers.

### SageTeX (SageMath)

Location: `sagetex.ts`

SageTeX embeds Sage computations in LaTeX. The build pipeline:

1. LaTeX first pass generates `.sagetex.sage`
2. Compute SHA1 hash of the `.sagetex.sage` file (for change detection)
3. If hash changed (or force build): run `sage <base>.sagetex.sage`
4. Re-run LaTeX to incorporate Sage outputs

The hash-based deduplication avoids re-running Sage when the computations
haven't changed.

### PythonTeX

Location: `pythontex.ts`

PythonTeX embeds Python (and other language) code in LaTeX:

1. LaTeX first pass generates `.pytxcode` directory
2. Run `pythontex3 --jobs 2 [--rerun=always] '<base>'`
3. Re-run LaTeX to incorporate Python outputs

- Force build uses `--rerun=always` to re-execute all code snippets
- Sets `MPLBACKEND=Agg` for matplotlib compatibility
- Jobs limited to 2 to prevent OOM

## SyncTeX (Forward/Inverse Search)

Location: `synctex.ts`

SyncTeX enables bidirectional navigation between source and PDF:

### Forward Search (Source → PDF)

`synctex_tex_to_pdf(line, column, filename)`:

1. Calls `synctex view -i <line>:<column>:<full_path> -o <pdf_file>`
2. Parses output for `Page`, `x`, `y` coordinates
3. Scrolls PDF viewer to the matching position

Triggered by:

- Clicking the "Sync" button
- Automatic cursor tracking (debounced, with loop prevention)

### Inverse Search (PDF → Source)

`synctex_pdf_to_tex(page, x, y)`:

1. Calls `synctex edit -o <page>:<x>:<y>:<pdf_file>`
2. Parses output for `Input` (source file), `Line`, `Column`
3. Resolves the canonical path (handles case differences, e.g., `.Rnw` vs `.rnw`)
4. Opens the source file and jumps to the line

Triggered by double-clicking in the PDF viewer.

### Auto-Sync Loop Prevention

The editor tracks `autoSyncInProgress` state to prevent infinite loops
where a forward search triggers a viewport change which triggers an inverse
search and so on. The flag is cleared after the viewport actually changes
or after a 2-second timeout.

## Frame Types

The LaTeX editor spec (`editor.ts`) defines these frame types:

| Key                       | Type                   | Component         | Description                     |
| ------------------------- | ---------------------- | ----------------- | ------------------------------- |
| `cm`                      | `"cm"`                 | CodemirrorEditor  | LaTeX source editor             |
| `output`                  | `"latex-output"`       | Output            | Combined output panel (default) |
| `pdfjs_canvas`            | `"preview-pdf-canvas"` | PDFJS             | Standalone PDF.js viewer        |
| `error`                   | `"errors"`             | ErrorsAndWarnings | Errors and warnings list        |
| `build`                   | `"latex-build"`        | Build             | Build log and controls          |
| `latex_table_of_contents` | `"latex-toc"`          | TableOfContents   | Document structure              |
| `word_count`              | `"latex-word_count"`   | LatexWordCount    | Word count display              |
| `pdf_embed`               | `"preview-pdf-native"` | PDFEmbed          | Browser's native PDF viewer     |
| `terminal`                | (shared)               | Terminal          | Terminal emulator               |
| `time_travel`             | (shared)               | TimeTravel        | Version history                 |

### Default Layout

The default layout is a two-column split: source editor on the left, combined
output panel on the right (`_new_frame_tree_layout()`).

### Combined Output Panel

The `Output` component (`output.tsx`) is a tabbed panel combining:

- **PDF** — PDF.js canvas viewer with zoom, page navigation, sync controls
- **Contents** — Table of contents parsed from the LaTeX source
- **Files** — Sub-files detected via `-deps` (input/include dependencies)
- **Build** — Full build log with real-time streaming output
- **Problems** — Parsed errors and warnings with line-click navigation
- **Stats** — Word count and document statistics

## PDF Viewer

### PDF.js Integration

Location: `pdfjs.tsx`, `pdfjs-canvas-page.tsx`

The PDF viewer uses Mozilla's PDF.js library for rendering:

- Canvas-based page rendering
- Text layer overlay for selection (`pdfjs-text.tsx`)
- Annotation support (`pdfjs-annotation.tsx`)
- Document caching (`pdfjs-doc-cache.ts`) — caches loaded PDF documents
- Pinch-to-zoom support

### PDF File Watching

Location: `pdf-watcher.ts`

The `PDFWatcher` monitors the output PDF file for changes using directory
listings. When the PDF changes (detected by mtime), it triggers a reload
in the viewer. This handles cases where the PDF is rebuilt externally
(e.g., by a terminal command).

## Build Log Parsing

Location: `latex-log-parser.ts`

Derived from ShareLaTeX's log parser (MIT license). Parses `latexmk` output
into structured errors, warnings, and typesetting issues:

```typescript
interface IProcessedLatexLog {
  errors: Error[]; // fatal errors
  warnings: Error[]; // non-fatal warnings
  typesetting: Error[]; // overfull/underfull boxes
  all: Error[]; // combined
  files: string[]; // referenced files
}

interface Error {
  line: number | null; // source line number
  file: string; // source file path
  level: "error" | "warning" | "typesetting";
  message: string; // one-line summary
  content: string; // full error context
  raw: string; // raw log text
}
```

Features:

- Handles LaTeX's 79-character line wrapping
- Parses nested file references (parenthesis-based stack)
- Extracts line numbers from various warning formats
- Filters dependency files by extension whitelist

## Gutter Markers

Location: `gutters.tsx`

Build errors and warnings are shown as gutter markers in the CodeMirror
editor. The `update_gutters()` function maps parsed log entries to
CodeMirror line widgets, showing error/warning icons next to the relevant
source lines.

## Redux State

```typescript
interface LatexEditorState extends CodeEditorState {
  build_logs: BuildLogs; // per-step build output (Map<BuildSpecName, BuildLog>)
  sync: string; // SyncTeX state
  scroll_pdf_into_view: ScrollIntoViewMap; // PDF scroll target
  word_count: string; // word count result
  zoom_page_width: string; // zoom to fit width
  zoom_page_height: string; // zoom to fit height
  build_command: string | List<string>; // current build command
  knitr: boolean; // whether this is a Knitr document
  knitr_error: boolean; // Knitr processing error
  build_command_hardcoded?: boolean; // set by % !TeX cocalc directive
  contents?: TableOfContentsEntryList; // table of contents
  building?: boolean; // build in progress
}
```

### Build Spec Names

```typescript
type BuildSpecName =
  | "build"
  | "latex"
  | "bibtex"
  | "sagetex"
  | "pythontex"
  | "knitr"
  | "clean";
```

Each build step stores its output in `build_logs[step]`:

```typescript
type BuildLog = ExecOutput & {
  parse?: IProcessedLatexLog; // parsed log (for latex step)
  output?: string; // used in clean step
};
```

## Key Constants

| Constant              | Value             | Description                |
| --------------------- | ----------------- | -------------------------- |
| `TIMEOUT_LATEX_JOB_S` | 900 (15 min)      | Maximum build job duration |
| `KNITR_EXTS`          | `["rnw", "rtex"]` | Knitr file extensions      |

## Key Source Files

| File                      | Description                                                  |
| ------------------------- | ------------------------------------------------------------ |
| `editor.ts`               | Editor spec: frame types, commands, buttons                  |
| `actions.ts`              | Actions class (~1900 lines): build pipeline, SyncTeX, config |
| `types.ts`                | BuildSpec, BuildLog, ScrollIntoView types                    |
| `register.ts`             | File extension registration (.tex, .rnw, .rtex)              |
| `latexmk.ts`              | latexmk execution, engine config, build_command()            |
| `synctex.ts`              | Forward/inverse search via synctex CLI                       |
| `sagetex.ts`              | SageTeX execution and error parsing                          |
| `pythontex.ts`            | PythonTeX execution and error parsing                        |
| `knitr.ts`                | Knitr execution, error parsing, synctex patching             |
| `bibtex.ts`               | BibTeX execution                                             |
| `clean.ts`                | Auxiliary file cleanup (latexmk -c + rm)                     |
| `latex-log-parser.ts`     | LaTeX log → structured errors/warnings                       |
| `output.tsx`              | Combined output panel (PDF + build + errors)                 |
| `pdfjs.tsx`               | PDF.js viewer component                                      |
| `pdfjs-canvas-page.tsx`   | PDF.js canvas page renderer                                  |
| `pdfjs-doc-cache.ts`      | PDF document caching                                         |
| `pdf-watcher.ts`          | PDF file change detection                                    |
| `build.tsx`               | Build log display component                                  |
| `build-command.tsx`       | Build command editor UI                                      |
| `errors-and-warnings.tsx` | Error/warning list component                                 |
| `gutters.tsx`             | CodeMirror gutter markers for errors                         |
| `table-of-contents.ts`    | LaTeX ToC parsing                                            |
| `count_words.ts`          | Word count via texcount                                      |
| `util.ts`                 | pdf_path(), runJob(), ensureTargetPathIsCorrect              |
| `constants.ts`            | KNITR_EXTS, TIMEOUT_LATEX_JOB_S                              |

## Common Patterns for Agents

### Triggering a Build Programmatically

```typescript
const actions = redux.getEditorActions(project_id, path) as Actions;
await actions.build(); // normal build
await actions.force_build(); // force rebuild (bypasses caching)
```

### Adding a New Build Step

1. Add the step name to `BuildSpecName` in `types.ts`
2. Add a `BUILD_SPECS` entry with label, icon, and tooltip
3. Implement `run_<step>()` in `actions.ts`
4. Add detection logic in `run_build()` (check latex stdout for package usage)
5. Implement error parsing in a new `<step>_errors()` function

### Modifying the Build Command

```typescript
// Via actions
actions.set_build_command(["latexmk", "-xelatex", "-f", "-g", "file.tex"]);

// Via SyncDB (persisted, shared with collaborators)
syncdb.set({ key: "build_command", value: ["latexmk", "-pdf", ...] });
syncdb.commit();
```
