# LaTeX Hybrid Rich-Text Editing — Design & Architecture

> **Status:** Shipped on branch `latex-inline-widgets`. The CodeMirror
> source frame for `.tex` files gains a top toolbar plus a set of inline
> widgets that render standard LaTeX constructs (sections, inline styles,
> math, lists, verbatim, links, …) as their typeset equivalents while
> keeping the source canonical and editable. The build pipeline, SyncTeX,
> output panel, and the existing chat/bookmark gutter markers are
> unaffected.
>
> This file is the architecture reference for the feature. The
> historical design-proposal/phasing material (Codex review log, the
> Phase 2.0 `markText` spike and its test matrix) lived here while the
> work was in flight and has been removed now that the engine has
> shipped; see the git history of this file if you need it.

## Goal

Give users of the existing LaTeX frame editor a way to author and edit
`.tex` content with rendered, WYSIWYG-style affordances **without** moving
away from the source-editor paradigm. The CodeMirror frame stays the
canonical view; rendered widgets are a non-destructive overlay the user
can toggle on or off per frame.

The non-goal is a separate WYSIWYG editor frame. The same buffer, the
same cursor, the same SyncTeX positions — just decorated. The widget DOM
is purely a view layer; saving, building, SyncTeX, line numbers, error
gutters, and every other existing feature operate on the unchanged
buffer.

## UX Summary

### Toolbar

A horizontal bar always rendered above the CodeMirror frame for `.tex`
files:

```
┌────────────────────────────────────────────────────────────────────┐
│ [ Source | Rich ] │ Section▾  B  I  U  ⟨/⟩  ∑▾  🔗  ☷▾              │
└────────────────────────────────────────────────────────────────────┘
```

- **Far left:** an antd `Segmented` ("pill") — the master toggle for
  rendering inline widgets. Default is **Rich**. State is per-frame (each
  side of a split can differ) and per-user — stored in `local_view_state`
  (localStorage), never synced to collaborators via syncdb.
- **Right of the Segmented control:** format-action buttons that operate
  on the current selection / cursor regardless of view mode:
  - **Section▾** — Section / Subsection / Subsubsection / Plain. Wraps
    the selected lines.
  - **B / I / U** — wrap selection in `\textbf{…}` / `\textit{…}` /
    `\underline{…}`.
  - **⟨/⟩** — wrap selection in `\verb` or `verbatim` env (single vs.
    multi-line based on selection).
  - **∑▾** — insert inline `$…$`, display `\[…\]`, or open the AI formula
    dialog.
  - **🔗** — insert `\href{url}{text}` via a small dialog.
  - **☷▾** — insert itemize / enumerate / description skeleton.

### Widget behavior (when Rich is selected)

- Each recognized construct is replaced inline by a rendered DOM node via
  CodeMirror's `markText({replacedWith, clearOnEnter})`.
- **Hover** any widget → an antd Tooltip (see `widgets/common.tsx`) shows
  the raw LaTeX source (read-only, monospace).
- **Click / keyboard-enter** a widget → the marker is cleared, the CM
  cursor is placed at the source's left edge, and the editor is focused;
  the source is now editable inline. Clicking requires
  `handleMouseEvents: false` + an explicit `onMouseDown` → `marker.clear()`
  + `cm.setCursor(from)` + `cm.focus()`, because CM cannot position its
  cursor inside a replaced range. Widget DOM carries `role="button"`,
  `aria-label`, and `tabindex` so it is keyboard- and screen-reader
  reachable; `Enter`/`Space` activate it the same as a click.
- On cursor-leave + content change, the marker manager re-applies the
  widget against the new text (the **edit zone**: any widget whose line
  span intersects the cursor selection dissolves to raw source, so typing
  inside a dissolved widget isn't fought by premature re-marking).

### Math widget — AI-edit pencil

Math widgets have one piece of always-visible chrome: a faded-grey pencil
icon at the trailing edge of the rendered formula (full opacity on
hover). For display math (`$$…$$`, `\[…\]`, and the `equation`/`align`/…
envs) the formula is laid out as a centered block in its own
horizontally-scrollable box, with the pencil pinned to the top-right
corner so it sits beside the formula rather than wrapping below it.

Clicking the pencil opens the existing `ai_gen_formula` dialog
([codemirror/extensions/ai-formula.tsx](../packages/frontend/codemirror/extensions/ai-formula.tsx))
in **edit mode**: the current formula is shown read-only as context
(together with a few lines of surrounding document text — 5 lines before,
capped at 1000 chars, plus 5 lines after; see `surroundingContext` in
`widget-manager.tsx`), the user types what to change in an empty
instruction box, and on accept the formula range is replaced. The accept
path is race-safe — see "AI dialog accept path" below. Single-click on a
formula (not on the pencil) behaves like every other widget.

### Per-document math macros

User-defined preamble macros are fed to KaTeX so the in-buffer preview
matches the real compile:

- `latex-macros.ts::extractMacros(text)` scans the buffer for
  `\newcommand` / `\renewcommand` / `\providecommand`, `\def\name…`, and
  `\DeclareMathOperator`, producing a KaTeX-compatible macro map
  (e.g. `\R → \mathbb{R}`).
- The widget manager re-scans on change, diffs the map by
  `JSON.stringify`, and on change disposes **all** live marks so every
  formula re-renders with the new macros. The map is delivered to
  arbitrarily-nested inline math via React Context
  (`MathMacrosContext`) — see `math.tsx` and `widgets/render-inline.tsx`,
  both of which read it with `useContext`.
- The map is passed as the 3rd arg to
  [`mathToHtml`](../packages/frontend/misc/math-to-html.ts); the default
  (no-macros) path still uses the shared module-level macro map so the
  issue-5750 cross-formula `\gdef` persistence keeps working.
- **KaTeX failure is non-fatal:** when a formula can't render (an unknown
  macro, or it's mid-edit and temporarily broken) the widget shows the
  raw LaTeX source (with the KaTeX error on hover), **not** a jarring
  `?math?` marker.

### What renders

| Family            | Constructs                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Sectioning        | `\part` … `\subparagraph` (+ starred)                                                                                  |
| Text style        | `\textit` `\textbf` `\emph` `\underline` `\texttt` `\textsc` `\textsf` `\textrm` `\textsuperscript` `\textsubscript`    |
| Color             | `\textcolor{c}{text}`                                                                                                  |
| Inline math       | `$…$`, `\(…\)`                                                                                                          |
| Display math      | `\[…\]`, `$$…$$` (single-line) — rendered as a centered block on its own line                                          |
| Math envs         | `equation` `align` `gather` `multline` (+ starred; auto-numbering stripped in preview so KaTeX doesn't show fake tags) |
| Verbatim          | `\verb` (inline) and `\begin{verbatim\|Verbatim}…\end{…}`                                                               |
| Links             | `\href{url}{text}`, `\url{url}`                                                                                        |
| Lists             | `itemize` `enumerate` `description` — `\begin/\end` markers + `\item` chips                                            |
| Tier 2 inline     | `\footnote` `\ref` `\cite` `\label` `\caption` `\sout` (ulem) `\hl` (soul)                                             |
| Prose envs        | `abstract` + theorem family — narrow begin/end chips so inner widgets in the body still render                        |
| Code listings     | `\begin{lstlisting\|minted}…\end{…}` — covering widget, body is raw code                                               |
| Document-level    | `\title` `\author` `\date` `\maketitle` `\tableofcontents`                                                            |
| Graphics          | `\includegraphics[opts]{path}` — via `raw_url`; width from `[width=N\textwidth]`; "image not found" fallback         |
| Glyphs            | `\TeX` `\LaTeX` — typographic logos                                                                                    |
| Structural        | `\newpage` `\clearpage` `\pagebreak` `\linebreak` `\bigskip` `\medskip` `\smallskip`                                  |
| Tabular           | `\begin{tabular}…` — fail-open: emitted only when the colspec parses and every row's cell count matches               |
| Custom-macro      | unknown `\cmd{…}` not in any allowlist → neutral chip, body in tooltip                                                 |

**Empty-arg handling.** `\section{}`, `\textbf{}`, etc. still render as a
widget with dimmed placeholder text ("empty heading" / "empty math" / …),
click-to-edit.

**Nested rendering.** Text-style and a few other widgets render their
*content* recursively through `renderInline` (`widgets/render-inline.tsx`),
which reuses the same `parseLines` scanner. So
`\textbf{bold \textit{italic} $x \in \R$}` shows a bold run containing an
italic run and a KaTeX formula — and that nested math gets the document
macro map via `MathMacrosContext`. This is purely presentational (no
`Widget` wrapper); clicks bubble to the outer widget so activating any
part dissolves the whole construct to source.

**Acknowledged gaps.** `\ref`/`\cite` show the literal key (no aux/bib
resolution); `figure`/`table` floats aren't structured (bare
`\includegraphics` is); deep `enumerate` lettering renders flat `1. 2. 3.`
at every depth; `\mathbf`/`\mathcal`/… are rendered by KaTeX inside math
widgets, not as separate text-mode widgets.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ LatexCodemirrorEditor (wrapper — index.tsx)                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ <RichEditToolbar />  (toolbar.tsx)                          │  │
│  │   - antd Segmented bound to frame-data "richEditMode"       │  │
│  │   - format-action buttons via actions.format_action        │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ <CodemirrorEditor … />  (unchanged, standard component)     │  │
│  │  + WidgetManager subscription when Rich is on:              │  │
│  │     - wait for actions._cm[id] (CM ready, via polling)      │  │
│  │     - cm.on("change", debounced rescan)                     │  │
│  │     - cm.on("viewportChange", rescan)                       │  │
│  │     - cm.on("cursorActivity", edit-zone + popover)          │  │
│  │     on Rich-off / unmount: clear all marks, unmount all     │  │
│  │       React roots (deferred), detach handlers               │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

The editor wire-up lives in
[latex-editor/editor.ts](../packages/frontend/frame-editors/latex-editor/editor.ts),
which sets `cm.component = LatexCodemirrorEditor`. The wrapper forwards
all `EditorComponentProps` unchanged to the underlying `CodemirrorEditor`
— we wrap, we don't fork.

### Marker manager

The parser is **pure** — `parse(text, viewport) → WidgetDescriptor[]`,
same input always yields same output. A descriptor's saved range is
"as parsed" and goes stale the moment the buffer is edited, so the
manager **never** uses saved coordinates for diffing live state. Instead
it keeps a live, document-ordered registry per CM instance:

```ts
interface LiveMark {
  marker: CodeMirror.TextMarker; // CM5 handle — use .find() for current range
  type: WidgetType;
  payloadHash: string;           // stable hash of payload (excludes counters/positions)
  host: HTMLElement;             // attached DOM
  root: ReactDOM.Root;           // mounted React root
}
```

**One rescan step:** parse the viewport text → resolve each LiveMark's
current range via `marker.find()` (drop ones that return null — CM
cleared them, e.g. `clearOnEnter` fired) → filter both sequences to the
viewport ± hysteresis margin → LCS/document-order pairing on
`(type, payloadHash)`: matched pairs keep their marker+host+root and just
re-render the React tree; unmatched fresh descriptors get
`createRoot` + `markText`; unmatched live entries get `marker.clear()` +
`setTimeout(0, root.unmount)` + `host.remove()` → finally a
belt-and-braces sweep removes any stranded widget hosts in the CM
wrapper.

**Why `markText` can't reconcile itself:** clearing and re-creating a
mark (even with the same DOM) detaches the old DOM and re-inserts the
new one, triggering a React unmount. Reuse is only possible by keeping
the same `TextMarker` alive across rescans — so markers are
added/removed only when a descriptor actually appears/disappears.

**Hysteresis** (~±50 lines) prevents tear-down/remount thrash on a
single-line scroll. PDF-scroll → SyncTeX → CM `viewportChange` is the
worst-case trigger and is silent: `marker.find()` returns unchanged
positions, so all markers survive and no work happens.

### Parser strategy

A focused viewport-scoped scanner — **not** a full LaTeX parser. Three
structural patterns: brace-balanced commands (`\foo{…}{…}`, via a brace
counter); math delimiters (`$…$`, `\(…\)`, `\[…\]`, `$$…$$`);
environments (`\begin{name}…\end{name}`, via a line-by-line env stack).

**Hard rules:** anything from `%` to end-of-line is skipped (covers
`% chat:` / `% bookmark:` markers; escaped `\%` is not a comment); and
parsing is suspended inside `verbatim` / `lstlisting` / `minted` and
`\verb…`, mirroring LaTeX.

### List anchoring — fail-open

`\item` chips render only within balanced
`\begin{itemize|enumerate|description}…\end{…}` whose stack context is
known from the visible viewport. If balance is uncertain (an `\end` just
deleted, or the `\begin` is far above without context), **all** list
marks for that env are cleared and the source shows — better
source-visible than misleading. The `enumerate` counter is computed from
the live document-order index, **not** stored in `payloadHash`, so chips
don't remount when a sibling `\item` is inserted/deleted. Prose between
items stays live, so inner `\textbf` / `$…$` render through the normal
pipeline.

### AI dialog accept path (race-safety)

The `ai_gen_formula` call can take 5–30s. On pencil click: capture the
marker handle + current source, and `sourceHashAtOpen = sha1(source)`.
Open the dialog (edit mode, see above). The dialog resolves with the
**original text on cancel**, so distinguish cancel from accept by hash
equality. On accept, resolve the marker's current range via
`marker.find()`: bail if it's null (marker cleared meanwhile), or if the
range's current text hash ≠ `sourceHashAtOpen` (a concurrent edit
happened); otherwise `cm.replaceRange(result, from, to)` and the next
rescan re-marks.

### React roots & FrameContext

Each widget mounts in its own `createRoot`, which lives **outside** the
editor's `<FrameContext.Provider>`. So every render re-wraps children in
`<FrameContext.Provider value={frameContext}><MathMacrosContext.Provider …>`
(see `widget-manager.tsx`), otherwise frame-context hooks silently return
defaults. Unmounts are deferred via `setTimeout(0)` to avoid racing
React's render cycle, plus the post-rescan stranded-host sweep.

**useEffect deps must exclude unstable refs.** `useFrameContext()` returns
a new object identity on every parent render (the provider value is built
inline). Including it in the widget-attach `useEffect` deps caused
per-render teardown + re-attach, wiping the reconciler's live-marker
registry. Capture `frameContext` / `editor_actions` via `useRef` and
depend only on `[richEditMode, props.id]`.

## File layout

Code under `src/packages/frontend/frame-editors/latex-editor/rich-edit/`:

```
rich-edit/
├── index.tsx              LatexCodemirrorEditor wrapper
├── toolbar.tsx            Top-bar: Segmented + format buttons
├── types.ts               WidgetType, WidgetDescriptor, WidgetProps
├── parser.ts              parseLines / viewport scanner
├── widget-manager.tsx     Live registry + reconcile + CM hooks + macro scan
├── widget-renderer.tsx    Dispatch via Record<WidgetType, Component>
├── latex-macros.ts        extractMacros(text) → KaTeX macro map
├── math-macros-context.ts MathMacrosContext (per-document macros)
└── widgets/
    ├── common.tsx         Widget base + EmptyPlaceholder + hover Tooltip
    ├── render-inline.tsx  Recursive presentational renderer (nested constructs)
    ├── text-style.tsx     \textit \textbf \emph \underline \texttt \textsc
    │                       \textsf \textrm \textcolor \text{super,sub}script
    ├── section.tsx        \part … \subparagraph (+ starred)
    ├── link.tsx           \href + \url
    ├── verbatim.tsx       \verb (inline) + verbatim/Verbatim env
    ├── math.tsx           Inline + display + envs + AI pencil
    ├── list.tsx           \item chips + list env begin/end markers
    ├── tier2.tsx          \footnote \ref \cite \label \caption \sout \hl
    │                       + abstract/theorem family + lstlisting/minted
    ├── document.tsx       \title \author \date \maketitle \tableofcontents
    ├── includegraphics.tsx \includegraphics[opts]{path} via raw_url
    ├── glyph.tsx          \TeX \LaTeX
    ├── structural.tsx     \newpage \clearpage \pagebreak \linebreak \*skip
    ├── tabular.tsx        \begin{tabular}… (fail-open)
    └── custom-macro.tsx   unknown \cmd{…} fallback chip
```

## Phase 0 findings (still relevant)

Verified directly in the codebase before designing; the load-bearing
ones:

1. **CodeMirror 5** (`codemirror@^5.65.18`). `cm.markText(from, to, {
   replacedWith, clearOnEnter, handleMouseEvents, … })` replaces a range
   visually with a DOM node. The only other call site is legacy SageWS
   ([sagews.coffee:791](../packages/frontend/sagews/sagews.coffee)) — it
   does **not** combine `clearOnEnter` + React + viewport rescans, which
   is why this engine had to validate that combination from scratch.
2. **Frame-local state.** `CodeEditorActions.set_frame_data` /
   `_get_frame_data` store per-frame `data-` keys in
   `local_view_state.frame_tree[id]` (localStorage). Gotchas: invalid id
   → `undefined` (always pass a default); setting `undefined` deletes the
   field; `reset_frame_tree()` wipes; same-type split clones the leaf, so
   a split inherits the parent's `richEditMode` initially.
3. **Accessing the live cm.** `CodemirrorEditor` keeps `cmRef` private and
   stores the instance at `actions._cm[id]`; it *detaches and reuses* the
   CM DOM across re-renders rather than destroying it, so the wrapper
   must not assume per-render mount/unmount. The manager attaches once
   per CM instance (resolved via `actions._cm[id]`, with a
   `setTimeout(tryAttach, 100)` ready-poll), not per wrapper re-render.

## Risks & mitigations

| Risk                                         | Mitigation                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Parser perf on every keystroke               | Debounce; scope to the viewport; reconcile via LCS so unchanged widgets keep their marker/host/root.            |
| React mount leaks on rescans                 | Reuse host+root by live-marker identity; defer unmount via `setTimeout(0)`; sweep stranded DOM after each rescan. |
| Cursor edit-point lost on re-mark            | Never move the cursor on re-mark; only re-mark ranges whose text didn't change.                                 |
| Partial viewport when half an env is visible | Fail-open: render env-spanning constructs only when balance is known; else revert to source.                    |
| Switch state confuses collaborators          | Per-frame in localStorage; never sent through syncdb.                                                            |
| Chat/bookmark markers conflict               | Chat uses gutter+bookmark; we use `markText({replacedWith})`. `% chat:` / `% bookmark:` lines are comments → skipped. |
| AI dialog returns original text on cancel     | Accept path compares SHA of returned text vs. SHA at open; equal ⇒ no-op. Re-checks `marker.find()` + text SHA. |
| Custom macros silently mis-render            | Unknown `\cmd{…}` → neutral chip with hover-source (no false render). Unknown KaTeX macros → raw LaTeX fallback. |

## References

- [latex.md](latex.md) — current LaTeX editor architecture
- [frame-editors.md](frame-editors.md) — frame-editor framework
- [frontend.md](frontend.md) — frontend state management
- [code-editor/codemirror-gutter-marker.tsx](../packages/frontend/frame-editors/code-editor/codemirror-gutter-marker.tsx) — reference for `createRoot` + `FrameContext.Provider`
- [codemirror/extensions/ai-formula.tsx](../packages/frontend/codemirror/extensions/ai-formula.tsx) — AI formula dialog (edit mode wired up for the math pencil)
- [misc/math-to-html.ts](../packages/frontend/misc/math-to-html.ts) — KaTeX rendering wrapper (`mathToHtml`, extra-macros arg)
- [sagews/sagews.coffee:791](../packages/frontend/sagews/sagews.coffee) — the only other `markText({replacedWith})` site (legacy, no `clearOnEnter`)
