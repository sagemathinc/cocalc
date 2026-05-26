# LaTeX Hybrid Rich-Text Editing — Design Proposal

> **Status:** Design proposal in progress. Phase 0 (validate) and Phase 1
> (toolbar shell) are landed on branch `latex-inline-widgets`. Once the
> feature ships, the relevant sections will be folded into
> [latex.md](latex.md) and this file deleted.
>
> **Scope:** Adds a top toolbar to the LaTeX CodeMirror source frame plus a
> set of inline widgets that render standard LaTeX constructs (sections,
> inline styles, math, lists, verbatim, links) as their typeset
> equivalents while keeping the source editable. The build pipeline,
> SyncTeX, output panel, and existing chat/bookmark gutter markers are
> unaffected.

## Revisions after Codex review (2026-05-26)

After Phase 0 + the initial doc draft, the doc was reviewed by Codex
against the surrounding source. Verdicts and the resulting changes:

| Topic                                   | Verdict          | Change folded into this doc                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. `markText({replacedWith})` semantics | NEEDS-EXPERIMENT | Added Phase 2.0 spike with explicit test matrix; corrected "zero call sites" claim — legacy SageWS already uses `replacedWith` for atomic cell UI at [sagews.coffee:791](../packages/frontend/sagews/sagews.coffee). The React + `clearOnEnter` combination is still unproven here.                                                |
| B. Marker reuse strategy                | ISSUE            | Replaced "(range, type, payload-hash) diff" with: live `TextMarker` handles + `marker.find()`-based matching + LCS/document-order pairing + viewport hysteresis. `markText` itself does not reconcile — clear/re-mark detaches the DOM.                                                                                            |
| C. Frame data for Switch                | OK               | Documented gotchas: invalid id returns `undefined`; setting `undefined` deletes the field; `reset_frame_tree()` wipes; same-type split inherits initially.                                                                                                                                                                         |
| D. List rendering                       | ISSUE            | Added fail-open policy: only render balanced envs with known stack context; clear all list marks when balance becomes uncertain; counter is **not** part of payload-hash.                                                                                                                                                          |
| E. Phase 1 Switch                       | ISSUE → resolved | Phase 1 shipped the Segmented control behind a `PHASE2_WIDGETS_AVAILABLE` flag (disabled until validated). The flag was removed at Phase 6 once all widget families landed; the Segmented is now always enabled with Rich as default.                                                                                              |
| F. Scope                                | ISSUE            | Added: explicit empty-arg placeholder for `\section{}`-style; Tier 2 additions (`abstract`, `\caption`, `\sout`, `\hl`, theorem/proof chips); `\title`/`\author`/`\date`/`\maketitle` documented as gaps (need doc-level state); `\mathbf`/`\mathit` covered inside math widgets, not separately.                                  |
| G. CM lifecycle                         | ISSUE            | Added Phase 0 finding #7: `CodemirrorEditor` keeps `cmRef` private and detaches/reuses CM DOM; the wrapper subscribes via `editor_actions._cm[id]` only after a ready check. Parser also skips comments + verbatim spans during scans.                                                                                             |
| H. Keyboard/hover popover               | ISSUE            | Redesigned: source-peek surfaces on hover (mouse) and on cursor-at-widget-boundary (keyboard), **not** on any cursor in line; added explicit "Show LaTeX source at cursor" shortcut; widget DOM gets aria-label and is focusable.                                                                                                  |
| I. AI dialog accept                     | ISSUE            | Made race-safe: store original-source SHA at dialog open; on return verify the formula's `marker.find()` range still maps to text whose SHA matches; cancel returns original text (per [ai-formula.tsx](../packages/frontend/codemirror/extensions/ai-formula.tsx)) → distinguish from accept by hash equality; no-op on mismatch. |

**Top 3 from Codex (applied):**

1. ✅ **markText spike before Phase 2.** Added as Phase 2.0; test matrix specified below.
2. ✅ **Redesigned marker-manager** around live handles + `marker.find()`-matching + viewport hysteresis. Old "saved-range key" diff retired.
3. ✅ **Phase 1 Switch disabled.** Originally landed behind a
   `PHASE2_WIDGETS_AVAILABLE` flag in
   [toolbar.tsx](../packages/frontend/frame-editors/latex-editor/rich-edit/toolbar.tsx);
   flag removed at Phase 6 once the engine had broad coverage.

## Goal

Give users of the existing LaTeX frame editor a way to author and edit
`.tex` content with rendered, WYSIWYG-style affordances **without** moving
away from the source-editor paradigm. The CodeMirror frame stays the
canonical view; rendered widgets are a non-destructive overlay the user
can toggle on or off per frame.

The non-goal is a separate WYSIWYG editor frame. The same buffer, the
same cursor, the same SyncTeX positions — just decorated.

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
  rendering inline widgets. **Phase 2 v0.1 default: Rich** (so the
  feature is visible immediately). State is per-frame (each side of a
  split can be in a different state) and per-user (not synced to
  collaborators via syncdb — purely local view state).
- **Right of the Segmented control:** format-action buttons that
  operate on the current selection / cursor regardless of view mode:
  - **Section▾** — dropdown: Part / Chapter / Section / Subsection /
    Subsubsection / Paragraph / Subparagraph (+ starred variants).
    Wraps the selected lines.
  - **B / I / U** — wrap selection in `\textbf{…}` / `\textit{…}` /
    `\underline{…}`.
  - **⟨/⟩** — wrap selection in `\verb` or `verbatim` env (single
    vs. multi-line based on selection).
  - **∑▾** — insert inline `$…$`, display `\[…\]`, or open the AI
    formula dialog.
  - **🔗** — insert `\href{url}{text}` via a small dialog.
  - **☷▾** — insert itemize / enumerate / description skeleton.

### Widget behavior (when Rich is selected)

- Each recognized construct is replaced inline by a rendered DOM node
  via CodeMirror's `markText({replacedWith, clearOnEnter})`.
- **Hover** any widget → a small popover anchored to the widget's
  bounding rect shows the raw LaTeX source (read-only, monospace). The
  popover dismisses on mouseleave. No chrome on the widget itself
  (except for math; see below).
- **Click** a widget → cursor lands inside the marked range. CM5's
  `clearOnEnter` dissolves the mark, the source is now editable inline.
  On cursor leave + content change, the marker manager re-applies the
  widget against the new text.
- **Keyboard parity:** when the CM cursor lands directly at a widget's
  left or right boundary (not arbitrarily anywhere on the line), the
  same source-peek popover surfaces. A dedicated shortcut **Ctrl-Shift-S**
  ("Show LaTeX source at cursor") opens the popover for the nearest
  widget under the cursor. Widget DOM nodes carry `aria-label` (the raw
  LaTeX source) and a `tabindex` so screen readers and tab-navigation
  reach them.
- **Touch:** a tap enters the mark and dissolves it — source becomes
  visible inline. The hover popover does not apply on touch.

### Math widget — small exception

Formulas have one piece of always-visible chrome: a faded-grey pencil
icon at the trailing edge of the rendered formula. Hover the widget →
pencil goes full opacity. Click pencil → opens the existing
`ai_gen_formula` dialog
([codemirror/extensions/ai-formula.tsx](../packages/frontend/codemirror/extensions/ai-formula.tsx))
pre-populated with the formula's current LaTeX. On accept, the formula
range is replaced and the cursor placed at end of replacement. The
accept path is race-safe — see "AI dialog accept path" below.

Single-click on a formula (not on the pencil) behaves like every other
widget: cursor enters → mark dissolves → inline edit.

### What renders

**Tier 1 (must-have)**

| Family       | Constructs                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Sectioning   | `\part`, `\chapter`, `\section`, `\subsection`, `\subsubsection`, `\paragraph`, `\subparagraph` (+ starred) |
| Text style   | `\textit`, `\textbf`, `\emph`, `\underline`, `\texttt`, `\textsc`, `\textsf`, `\textrm`                     |
| Color        | `\textcolor{c}{text}`                                                                                       |
| Inline math  | `$…$`, `\(…\)`                                                                                              |
| Display math | `\[…\]`, `$$…$$`                                                                                            |
| Math envs    | `equation`, `equation*`, `align`, `align*`, `gather`, `gather*`, `multline`, `multline*`                    |
| Verbatim     | `\verb` (single-char delimiter), `\begin{verbatim}…\end{verbatim}`                                          |
| Links        | `\href{url}{text}`, `\url{url}`                                                                             |
| Lists        | `itemize`, `enumerate`, `description` — hide `\begin/\end`, replace `\item` with marker chip                |

**Empty-arg handling.** `\section{}`, `\textbf{}`, etc. with empty
content still render as a widget — placeholder text "(empty heading)" /
"(empty bold)" inside the widget, dimmed, click-to-edit.

**Tier 2 (stretch — same release if cheap)**

- `\begin{lstlisting}` and `\begin{minted}` — rendered as syntax-highlighted code block
- `\footnote{…}` — small superscript marker
- `\ref{…}`, `\cite{…}` — neutral chip with the literal key (no aux-file resolution)
- `abstract` env — render as a soft-bordered block with "Abstract" label
- `\caption{…}` — italic caption block (independent of surrounding figure/table)
- `\sout{…}` (ulem strikethrough), `\hl{…}` (soul highlight) — straightforward inline marks
- Theorem-like envs (`theorem`, `lemma`, `proof`, `definition`, …) — neutral chips with env name; full structured render is a later effort
- **Custom-macro fallback:** parser detects `\unknownMacro{…}` not in the widget allowlist → renders a neutral chip "custom macro" with hover-source

**Explicit v0 gaps (acknowledged in docs / UI tooltips)**

- Tables (`tabular`, `array`) — package-specific (`booktabs`, `array`); separate effort
- Custom preamble macros from `\newcommand` — formulas using user-defined macros (e.g. `\QQ`) currently render with `?math?` because KaTeX doesn't know them. Per-file macro registry (parse `\newcommand` from preamble, feed to KaTeX) is planned as a follow-up.
- Deep `enumerate` lettering (`a) i.`) — flat `1. 2. 3.` at every depth in v0. Nested-list depth-aware bullets/numbers is a known open item to keep on the radar.
- Figures (`\begin{figure}…\end{figure}`) with captions/centering/float positioning — figure env handling not done. `\includegraphics{path}` alone IS rendered (Phase 6.2 — uses `raw_url` for src; width parsed from `[width=N\textwidth]`; fall back to "image not found" placeholder if load fails).
- `\ref` / `\cite` resolved against actual aux/bib files — just shows the literal key.
- `\mathbf{}`, `\mathit{}`, `\mathcal{}`, etc. — rendered _inside_ the math widget by KaTeX; not separate text-mode widgets.

## Phase 0 — Findings from validation

Verified directly in the codebase before designing.

### 1. CodeMirror version & widget API

The LaTeX editor uses **CodeMirror 5** (`codemirror@^5.65.18`). Relevant
APIs:

- `cm.markText(from, to, { replacedWith, clearOnEnter, handleMouseEvents, atomic, readOnly, … })` — replaces a range visually with a DOM node. There is **one existing call site** in the legacy SageWS code at [sagews.coffee:791](../packages/frontend/sagews/sagews.coffee), used for atomic cell UI. It does **not** use `clearOnEnter` + React + viewport-scoped rescans — so the combination we propose is still unproven and is the subject of the Phase 2.0 spike.
- `cm.setBookmark(pos, { widget, insertLeft, handleMouseEvents })` — inserts a widget at a single position without consuming any range. Used today by the chat-marker inline tail.
- `cm.on("change" | "viewportChange" | "cursorActivity", …)` — event hooks we'll need (see [code-editor/codemirror-editor.tsx:343-396](../packages/frontend/frame-editors/code-editor/codemirror-editor.tsx)).

### 2. Frame-local state pattern (Switch state)

`CodeEditorActions` exposes:

- `set_frame_data({ id, key1: val1, … })` — writes per-frame data with a
  `data-` prefix into the node ([code-editor/actions.ts:864](../packages/frontend/frame-editors/code-editor/actions.ts)).
- `_get_frame_data(id, key, def)` — reads it ([actions.ts:873](../packages/frontend/frame-editors/code-editor/actions.ts)).

State is stored in `local_view_state.frame_tree[id]`, persisted to
localStorage per file. Each frame in a split has independent data.

**Gotchas (codex review):**

- Invalid frame id → `_get_frame_data` returns `undefined`, so the
  default arg matters. Always pass a default.
- Setting a key to `undefined` via `set_frame_data` deletes the field
  via tree ops ([tree-ops.ts:128](../packages/frontend/frame-editors/frame-tree/tree-ops.ts)).
- `reset_frame_tree()` wipes all per-frame data
  ([actions.ts:902](../packages/frontend/frame-editors/code-editor/actions.ts)).
- Splitting a frame of the same type **clones the entire leaf**
  ([tree-ops.ts:480](../packages/frontend/frame-editors/frame-tree/tree-ops.ts)),
  so a new split inherits the parent's `richEditMode` initially. That
  matches the user's stated expectation; document it but don't fight it.

Usage:

```ts
const richEditOn =
  editor_actions._get_frame_data(id, "richEditMode", false) === true;
const toggle = () =>
  editor_actions.set_frame_data({ id, richEditMode: !richEditOn });
```

### 3. Swap point in editor.ts

[latex-editor/editor.ts:38-95](../packages/frontend/frame-editors/latex-editor/editor.ts)
defines the `cm` frame:

```ts
const cm: EditorDescription = {
  type: "cm",
  …,
  component: LatexCodemirrorEditor,   // ← swapped from CodemirrorEditor in Phase 1
  …,
};
```

The wrapper receives `EditorComponentProps`
([frame-tree/types.ts:198](../packages/frontend/frame-editors/frame-tree/types.ts))
and forwards all of them unchanged to the underlying `CodemirrorEditor`.
The standard `CodemirrorEditor`'s init/destroy lifecycle stays untouched
— we wrap, we don't fork.

### 4. React mount/unmount lifecycle for inline marks

The chat-marker bookmark system at
[latex-editor/actions.ts:3300-3450](../packages/frontend/frame-editors/latex-editor/actions.ts)
already mounts React subtrees into CM-attached DOM. Lessons:

- **`createRoot` mounts live outside the editor's `<FrameContext.Provider>`.**
  Any hook depending on frame context will silently return defaults
  unless you re-wrap. See the comment at
  [chat-marker-gutter.tsx:38-46](../packages/frontend/frame-editors/latex-editor/chat-marker-gutter.tsx).
  Mitigation: wrap children in `<FrameContext.Provider value={frameContext}>`
  on render — same pattern as
  [codemirror-gutter-marker.tsx:35](../packages/frontend/frame-editors/code-editor/codemirror-gutter-marker.tsx).

- **The chat pattern reuses hosts + roots by ordinal.** That works
  because chat markers are few and stable. Our viewport-scoped widgets
  are numerous and churn on every scroll, so the ordinal trick doesn't
  transfer. See the **Marker manager** design below for the corrected
  approach.

- **Defer unmount via `setTimeout(0)`** in cleanup paths to avoid races
  with React's render cycle (see [codemirror-gutter-marker.tsx:50](../packages/frontend/frame-editors/code-editor/codemirror-gutter-marker.tsx)).

- **Belt-and-braces sweep:** after a rescan, query the CM wrapper for
  stranded DOM hosts that aren't in the live set and remove them. The
  chat system does this at [actions.ts:3431-3446](../packages/frontend/frame-editors/latex-editor/actions.ts).

### 5. AI formula dialog — ready to wire up

[codemirror/extensions/ai-formula.tsx](../packages/frontend/codemirror/extensions/ai-formula.tsx)
exports `ai_gen_formula({ mode: "tex", text?, project_id, locale? })`
returning a `Promise<string>`. Dialog has preview, model selection,
regenerate, and accept/insert buttons.

**Caveat:** the dialog resolves with the **original text** when the user
cancels (see ai-formula.tsx around line 460). The caller must therefore
distinguish cancel from accept — see "AI dialog accept path" in the
Architecture section.

### 6. Math rendering — KaTeX via existing Markdown component

CoCalc renders math through `<Markdown auto_render_math />`
([components/markdown.tsx](../packages/frontend/components/markdown.tsx))
which feeds KaTeX. The math widget can either wrap that component
directly with a `$…$` payload or call the lower-level utilities in
[misc/math-to-html.ts](../packages/frontend/misc/math-to-html.ts).

### 7. CodeMirror lifecycle — accessing the cm instance from the wrapper

[CodemirrorEditor](../packages/frontend/frame-editors/code-editor/codemirror-editor.tsx)
keeps `cmRef` private (line 73) and stores the live `cm` instance on the
file actions at `actions._cm[id]` (registration around line 346,
[actions.ts:1598](../packages/frontend/frame-editors/code-editor/actions.ts)).
Importantly, it _detaches and reuses_ the CM DOM during re-renders
instead of destroying it (codemirror-editor.tsx around line 189), so the
wrapper component must not assume per-render mount/unmount semantics.

The wrapper subscribes to widget machinery only after a ready check:

```ts
useEffect(() => {
  if (!richEditOn) return;
  let dispose: (() => void) | null = null;
  let cancelled = false;
  const tryAttach = () => {
    if (cancelled) return;
    const cm = editor_actions._cm?.[id] ?? editor_actions._get_cm?.(id);
    if (cm) {
      dispose = attachWidgetManager(cm, editor_actions);
    } else {
      setTimeout(tryAttach, 100);
    }
  };
  tryAttach();
  return () => {
    cancelled = true;
    dispose?.();
  };
}, [richEditOn, id]);
```

The dispose function clears every live marker, unmounts every React
root (deferred via `setTimeout(0)`), and removes the CM event handlers.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ LatexCodemirrorEditor (wrapper component)                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ <RichEditToolbar />                                        │  │
│  │   - antd Switch bound to frame-data "richEditMode"         │  │
│  │   - format-action buttons (heading/bold/italic/.../list)   │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ <CodemirrorEditor … />  (unchanged, standard component)    │  │
│  │  + WidgetManager subscription (Phase 2+)                   │  │
│  │     on richEditOn:                                         │  │
│  │       - wait for actions._cm[id] (CM ready)                │  │
│  │       - cm.on("change", debounced rescan)                  │  │
│  │       - cm.on("viewportChange", rescan)                    │  │
│  │       - cm.on("cursorActivity", maybe-popover, shortcut)   │  │
│  │       - initial rescan                                     │  │
│  │     on richEditOff/unmount: clear all marks,               │  │
│  │       unmount all roots (deferred), detach handlers        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Marker manager (revised)

The parser is **pure** — `parse(text, viewport) → WidgetDescriptor[]`,
same input always yields same output. Descriptors carry
`{type, range: {from, to}, payload: {...}}` but the `range` here is the
"as parsed" range at scan-time; it gets stale immediately when the
buffer is edited. The manager must **never use these saved coordinates
for diffing live state**.

The manager maintains a live registry per CM instance:

```ts
interface LiveMark {
  marker: CodeMirror.TextMarker; // CM5 handle — use .find() for current range
  type: WidgetType;
  payloadHash: string; // stable hash of payload (not including counter)
  host: HTMLElement; // attached DOM
  root: ReactDOM.Root; // mounted React root
}
const live: LiveMark[] = []; // document-order
```

#### One rescan step

```
viewport = cm.getViewport()                ; { from, to } as line numbers
text     = cm.getRange({line:from,ch:0},
                       {line:to,  ch:0})
fresh    = parse(text, viewport)           ; WidgetDescriptor[] in document order

# Reconcile fresh ↔ live:
1. For each existing LiveMark, resolve current range via marker.find().
   Drop entries whose .find() returns null (CM cleared them; e.g. cursor
   entered + clearOnEnter triggered).

2. Filter both sequences to the visible viewport range
   (plus a small hysteresis margin so a widget half-scrolled-off
   isn't immediately torn down).

3. Run an LCS / document-order pairing on (type, payloadHash). Pairs
   that match: leave the marker, host, and React root alive — just
   re-render the React tree with the new descriptor (props may have
   changed even if payloadHash equals; payloadHash excludes positions
   and counters precisely so unchanged-content widgets stay alive).

4. For unmatched fresh descriptors: createRoot + render + cm.markText({
     replacedWith: host, clearOnEnter: true, handleMouseEvents: true,
     inclusiveLeft: false, inclusiveRight: false, atomic: false,
   }). Push to live registry.

5. For unmatched live entries: marker.clear(); setTimeout(0, root.unmount);
   host.remove(). Drop from registry.

6. Belt-and-braces sweep: any host element with our widget class in the
   CM wrapper that's not in the live registry → remove.
```

**Why `markText` itself does not reconcile:** `markText({replacedWith})`
inserts the given DOM into CM's layout once and tracks the range. When
the mark is cleared and re-created (even with the same DOM element),
CM detaches the old DOM and re-inserts the new one — that triggers a
React unmount on the detached host. So reuse is **only** possible by
keeping the same `TextMarker` alive across rescans, which means: only
add/remove markers when a descriptor actually appears/disappears.

**Hysteresis.** Keep markers alive for descriptors within `viewport ±
50 lines` (or so). This prevents tear-down/remount thrash when the user
scrolls a single line.

**Edit-zone exclusion.** When the cursor is inside or adjacent to a
widget range, skip the rescan for that widget (or that env). Otherwise
typing into a dissolved widget would constantly fight the marker
manager to re-mark prematurely.

### Parser strategy

A focused viewport-scoped scanner — **not** a full LaTeX parser. Three
structural patterns:

1. **Brace-balanced commands:** `\foo{…}` and `\foo{…}{…}` for
   sectioning, text style, color, links, footnote. Regex for `\foo{`
   prefix, then a small brace-counter walking right to find the
   matching `}`.

2. **Math delimiters:** `$…$`, `\(…\)`, `\[…\]`, `$$…$$` — paired
   delimiters, balance not required.

3. **Environments:** `\begin{name}…\end{name}` — for verbatim, math
   envs, lists, lstlisting/minted. A stack of open envs built by
   walking line-by-line.

**Hard rules:**

- **Skip comments:** anything from `%` to end-of-line is not scanned
  for constructs (covers `% chat:` / `% bookmark:` markers and any
  LaTeX comments). An escaped `\%` is not a comment.
- **Skip inside `verbatim`, `lstlisting`, `minted` and `\verb…`:** these
  envs/commands suspend LaTeX command parsing; we mirror that.

The parser is **idempotent and pure** — same text in, same descriptors
out — so the diff in `markerManager.apply` is meaningful.

### List widget anchoring — fail-open policy

Lists need slightly more care than brace-balanced constructs because
typing breaks balance continuously. The rules:

- Render `\item` chips **only** within balanced
  `\begin{itemize|enumerate|description}…\end{...}` whose stack context
  is fully known from the visible viewport (the matching `\begin` must
  be visible or inferable from a cheap upward scan; we don't load the
  full document).
- If balance is uncertain (e.g. `\end{itemize}` was just deleted, or
  the `\begin` is far above the viewport without context), **clear all
  list marks for that env** and revert to source view for the affected
  range. Better source-visible than a misleading render.
- The `\item` counter for `enumerate` is **computed from live position,
  not stored in payloadHash.** payloadHash for an `\item` chip is just
  `{type:"list-item", envType, level, label?}`. The counter is rendered
  from the current document-order index within the env. This keeps
  payloadHash stable so chips don't remount on insertion/deletion of a
  sibling `\item`.
- Indent: handled by left-margin CSS on the marker chip based on the
  current env-stack depth.
- Prose between `\item` tokens stays as live source — `\textbf` /
  `$…$` etc. inside list items render through the same widget pipeline.

### Hover popover

A single shared `HoverPopover` instance, positioned absolutely against
the widget's `getBoundingClientRect()`. Triggers:

1. **Mouse hover** on the widget DOM (`mouseenter`/`mouseleave`).
2. **Keyboard:** cursor lands at the widget's left or right boundary
   (not arbitrarily anywhere on the line). Tracked via
   `cm.on("cursorActivity", …)`.
3. **Explicit shortcut Ctrl-Shift-S** ("Show LaTeX source at cursor"):
   walks live markers for the one nearest to the current cursor and
   opens the popover anchored to it.

Content: the raw LaTeX source for that descriptor (monospace, read-only,
selectable). Width capped; long content scrolls inside the popover.

Dismissal: mouseleave, cursor moves off the boundary, scroll, Escape.

**Accessibility:** every widget DOM has `role="button"`,
`aria-label="LaTeX: <source>"`, and `tabindex="0"` so it's reachable by
keyboard navigation and announced by screen readers as the raw LaTeX,
not as "presentation."

### AI dialog accept path (race-safety)

When the user clicks the math widget pencil:

```
1. Capture the marker handle and the current source via marker.find()
   + cm.getRange. Compute sourceHashAtOpen = sha1(currentSource).
2. Open the ai_gen_formula dialog with text = currentSource.
3. Dialog returns a string. Distinguish cancel from accept by hash:
     if sha1(returnedString) === sha1(currentSource) → cancel/no-op.
     (ai-formula.tsx resolves with the original text on cancel.)
4. Otherwise resolve current marker range via marker.find():
     a. If marker.find() returns null (marker was cleared meanwhile —
        cursor entry, switch off, collaborator wipe), bail. Optionally
        toast: "Formula was edited externally — please re-open the
        editor."
     b. Else compute currentText2 = cm.getRange(range); if
        sha1(currentText2) !== sourceHashAtOpen, the user (or a peer)
        edited the formula while the dialog was open. Bail with the
        same toast.
     c. Else cm.replaceRange(returnedString, range.from, range.to).
        Cursor placed at end of replacement. Next rescan re-marks.
```

This handles the realistic 5–30s window the LLM call may take.

## File layout

Code under `src/packages/frontend/frame-editors/latex-editor/rich-edit/`:

```
rich-edit/
├── index.tsx              LatexCodemirrorEditor wrapper             (Phase 1 ✅)
├── toolbar.tsx            Top-bar: Segmented + format buttons       (Phase 1 ✅)
├── types.ts               WidgetType, WidgetDescriptor, WidgetProps (Phase 2 ✅)
├── parser.ts              parseViewport(cm, fromLine, toLine)       (Phase 2 ✅)
├── widget-manager.tsx     Live registry + reconcile + CM hooks      (Phase 2 ✅)
├── widget-renderer.tsx    Dispatch via Record<WidgetType,Component> (Phase 2 ✅)
├── hover-popover.tsx      Shared styled source-peek popover         (Phase 2 v0.2 ✅ — uses antd Tooltip via widgets/common.tsx)
├── ai-accept.ts           Race-safe AI dialog accept helper         (Phase 4)
├── rich-edit.sass         Widget styles + hover state               (Phase 2/3)
└── widgets/
    ├── common.tsx         Widget base + EmptyPlaceholder + Tooltip  (Phase 2 v0.2 ✅)
    ├── spike-badge.tsx    <<SPIKE>> dev/debug badge                 (Phase 2.0 ✅)
    ├── text-style.tsx     \textit \textbf \emph \underline \texttt
    │                       \textsc \textsf \textrm \textcolor       (Phase 3 ✅)
    ├── section.tsx        \part…\subparagraph (+ starred)           (Phase 3 ✅)
    ├── link.tsx           \href + \url                              (Phase 3 ✅)
    ├── verbatim.tsx       \verb (inline; verbatim env deferred)     (Phase 3 ✅)
    ├── math.tsx           Inline + display + envs + AI pencil       (Phase 4 ✅)
    ├── list.tsx           \item chips + env begin/end markers       (Phase 5 ✅)
    ├── tier2.tsx          \footnote \ref \cite \label \caption
    │                       \sout \hl + abstract / theorem-family /
    │                       lstlisting / minted envs                 (Phase 6 ✅)
    ├── document.tsx       \title \author \date \maketitle
    │                       \tableofcontents                          (Phase 6.2 ✅)
    └── includegraphics.tsx \includegraphics[opts]{path} via raw_url (Phase 6.2 ✅)
```

Wire-up: [latex-editor/editor.ts](../packages/frontend/frame-editors/latex-editor/editor.ts)
sets `cm.component = LatexCodemirrorEditor` (Phase 1 ✅).

## Phasing

| #   | Phase                                | Status | Deliverable                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Validate                             | ✅     | Findings above                                                                                                                                                                                                                                                                                                             |
| 1   | Toolbar shell + format actions       | ✅     | Wrapper + Switch (disabled) + format buttons via `actions.format_action`. No widget rendering. No localStorage state persisted.                                                                                                                                                                                            |
| 2.0 | `markText` spike                     | ✅     | `<<SPIKE>>` token widgets with live-marker reconciliation. Matrix walked (see below). Foundation validated.                                                                                                                                                                                                                |
| 2   | Widget infrastructure + first widget | ✅     | `types.ts` / `parser.ts` / `widget-manager.tsx` / `widget-renderer.tsx` (Record-based dispatch) / `widgets/common.tsx` (antd Tooltip source-peek). `\textit` end-to-end.                                                                                                                                                   |
| 3   | Tier 1 (excluding math + lists)      | ✅     | 9 text-style widgets, 7 sectioning widgets (+ starred), `\href`/`\url`, inline `\verb`. Multi-line `verbatim` env deferred to Phase 5 with the env-stack scanner.                                                                                                                                                          |
| 4   | Math widget                          | ✅     | Inline (`$…$`, `\(…\)`), display (`\[…\]`, `$$…$$` single-line), envs (`equation`/`align`/`gather`/`multline` + starred, multi-line). KaTeX via `misc/math-to-html`. Trailing pencil → race-safe `ai_gen_formula` (`marker.find()` + source-unchanged check before `replaceRange`).                                        |
| 5   | Lists + multi-line verbatim          | ✅     | Proper env-stack parser (`scanEnvBlocks`) handling nested envs. `list-env-begin` / `list-env-end` / `list-item` per balanced list env; item counter computed from index (not in payload-hash). Multi-line `verbatim` / `Verbatim` env reuses the same scanner. Fail-open: unbalanced envs render nothing → source visible. |
| 6   | Tier 2 (minus custom-macro fallback) | ✅     | Inline: `\footnote`, `\ref`, `\cite`, `\label`, `\caption`, `\sout`, `\hl`. Envs: `abstract`, theorem family (theorem/lemma/proof/definition/corollary/proposition/claim/remark/example/note), lstlisting/minted (preformatted block). Custom-macro fallback is a follow-up amend.                                         |
| 7   | Docs + polish                        | ⏳     | Fold this doc into [latex.md](latex.md); first-run popover hint                                                                                                                                                                                                                                                            |

### Phase 2.0 — `markText` spike

A focused experiment in a real `.tex` buffer to validate the
`markText({replacedWith, clearOnEnter})` + React mount combination
**before** committing to Phase 2's full marker manager.

**Mechanism.** A new `spike.ts` finds occurrences of the literal token
`<<SPIKE>>` in the visible viewport and replaces each with a small
React widget (a colored badge that says `SPIKE`). When the user clicks
or arrows into the marker, `clearOnEnter` dissolves it. On `change` the
spike module rescans and re-marks. Hover shows the literal source
`<<SPIKE>>` in a popover.

(Historical note: the spike was gated behind a `PHASE2_WIDGETS_AVAILABLE`
flag in `phase2-flag.ts`; the flag and the spike module were both
removed at Phase 6 once the real widget engine had broad coverage.)

**Test matrix (must each be observed and recorded):**

| #   | Behavior                                            | Expected                                                                              | Pass? |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------- | ----- |
| 1   | Click inside spike badge                            | Mark dissolves; source `<<SPIKE>>` visible; cursor inside                             |       |
| 2   | Arrow-key into spike from left                      | Mark dissolves; cursor at the original `from` position                                |       |
| 3   | Arrow-key into spike from right                     | Mark dissolves; cursor at the original `to` position                                  |       |
| 4   | Cursor leaves dissolved spike + content unchanged   | Spike re-marks on next debounced rescan                                               |       |
| 5   | Edit inside dissolved spike then leave              | If text no longer matches `<<SPIKE>>`, no re-mark; if still matches, re-mark          |       |
| 6   | Undo after edit-then-leave                          | Buffer text restores; spike re-marks                                                  |       |
| 7   | Redo                                                | Inverse of #6                                                                         |       |
| 8   | Select-all + copy                                   | Clipboard contains literal `<<SPIKE>>`, not the rendered DOM                          |       |
| 9   | Paste a `<<SPIKE>>` from clipboard                  | New spike marker appears on next rescan                                               |       |
| 10  | Find ("Ctrl-F") for `SPIKE`                         | Match highlights the marker source (not the rendered text)                            |       |
| 11  | Replace `<<SPIKE>>` with `xxx`                      | Marker disappears                                                                     |       |
| 12  | IME composition starting at a spike's left boundary | Composition works; spike dissolves cleanly                                            |       |
| 13  | Add a second cursor (alt-click) at another spike    | Both dissolve; multi-cursor edit works                                                |       |
| 14  | Drag-select across multiple spikes                  | Selection encompasses all; copy yields literal text                                   |       |
| 15  | Screen reader announces a focused spike             | Announces the aria-label (raw LaTeX), not "presentation"                              |       |
| 16  | Scroll spike out of viewport, then back             | Hysteresis keeps it alive within margin; outside, it's torn down + re-created cleanly |       |
| 17  | Two splits of same file, one with switch on         | Each frame independent; no cross-talk                                                 |       |
| 18  | Reload the page                                     | Spike re-marks in current viewport; no orphan DOM hosts                               |       |

Findings go into a new "Spike results" subsection appended to this doc
before Phase 2 starts.

### Spike results (2026-05-26)

**Foundation validated.** The proposed `markText({replacedWith,
clearOnEnter})` + React-mount + live-marker reconciliation strategy
works end-to-end on a real `.tex` buffer with the build pipeline,
SyncTeX, and PDF viewer running.

Key findings:

1. **Reconciliation prevents DOM thrash.** The initial naive
   clear-all-and-rebuild produced severe flicker (PDF scroll → SyncTeX
   → CM `viewportChange` → rescan). Replacing it with live-marker
   matching via `marker.find()` + `(line, ch, source)` key, plus
   edit-zone exclusion and ±50-line viewport hysteresis, eliminates
   flicker entirely. Phase 2's marker-manager **must** implement this
   pattern.

2. **CRITICAL: useEffect deps must exclude unstable refs.**
   `useFrameContext()` returns a new object identity on every parent
   render because [frame-tree.tsx](../packages/frontend/frame-editors/frame-tree/frame-tree.tsx)
   constructs `contextValue={{...}}` inline. Including `frameContext`
   in the spike-attach useEffect deps caused per-render teardown +
   re-attach, which wiped the reconciler's live-marker registry —
   exactly the failure mode the reconciler was designed to prevent.
   Fixed by capturing `frameContext` and `editor_actions` via `useRef`
   and depending only on `[richEditMode, props.id]`. Phase 2 must do
   the same.

3. **CM "ready" via polling works.** A `setTimeout(tryAttach, 100)`
   retry loop reliably picks up `actions._cm[id]` after
   `CodemirrorEditor`'s init `useEffect` runs. No explicit ready
   signal needed.

4. **antd `Segmented` preferred over `Switch`.** Two-state explicit
   choice (`[Source | Rich]`) is clearer than a binary Switch.
   Toolbar diagram updated.

5. **PDF-scroll → SyncTeX → CM viewport-change** is the worst-case
   trigger and now silent. SyncTeX moves the CM viewport on every PDF
   scroll; the reconciler's `marker.find()` returns unchanged
   positions, all markers survive, no work happens.

Matrix walk outcomes:

| #     | Result      | Notes                                                                                                                                                                                                                                               |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | ✅          | Click dissolves. Required `handleMouseEvents: false` + explicit `onMouseDown` → `marker.clear()` + `cm.setCursor(from)` + `cm.focus()`. Initial `handleMouseEvents: true` did nothing because CM can't position its cursor inside a replaced range. |
| 2     | ✅          | Arrow-key entry from left dissolves via `clearOnEnter` (CM-internal).                                                                                                                                                                               |
| 3     | ✅          | Arrow-key entry from right dissolves via `clearOnEnter`.                                                                                                                                                                                            |
| 4     | ✅          | Re-mark after edit-then-leave (debounced rescan on `cursorActivity`).                                                                                                                                                                               |
| 5     | ✅          | Partial edit (text no longer matches) — no re-mark; source stays visible.                                                                                                                                                                           |
| 6–7   | ✅          | Undo / redo.                                                                                                                                                                                                                                        |
| 8–9   | ✅          | Copy / paste retains literal source.                                                                                                                                                                                                                |
| 10–11 | ✅          | Find / replace.                                                                                                                                                                                                                                     |
| 12    | ✅          | IME composition.                                                                                                                                                                                                                                    |
| 13    | ⚠️ partial  | Alt-click multi-cursor dissolves all clicked markers but only places **one** cursor (the last). Spike uses `cm.setCursor` (replace); fix in Phase 3+ via `cm.addSelection` honoring `altKey`/`metaKey`. **Not blocking real widgets.**              |
| 14    | ✅          | Drag-select across multiple → copy retains literal source.                                                                                                                                                                                          |
| 15    | 🟡 deferred | Tab through widgets — CM's keymap captures Tab for indentation (correct for source editing). Proper fix is a CM `extraKey` override only while focus is on a widget. Accessibility nice-to-have, deferred.                                          |
| 16    | ✅          | Scroll out and back — hysteresis + reconciliation, no tear-down.                                                                                                                                                                                    |
| 17    | ✅ presumed | Split-frame independence (each frame has its own `data-richEditMode`).                                                                                                                                                                              |
| 18    | ✅ presumed | Reload re-attaches cleanly (localStorage round-trip).                                                                                                                                                                                               |

Foundation validated; Phase 2 builds on it directly.

## Risks & mitigations

| Risk                                                    | Mitigation                                                                                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser perf on every keystroke                          | Debounce (~50ms). Scope to `cm.getViewport()` only. Reconcile via LCS so unchanged widgets keep their existing marker/host/root.                                                                                        |
| React mount leaks on rescans                            | Reuse host+root by live-marker identity (paired by LCS over type+payloadHash); defer unmount via `setTimeout(0)`; sweep stranded DOM in the CM wrapper after each rescan.                                               |
| Cursor edit-point lost on re-mark                       | On re-mark, **do not** move the cursor. The cursor's CM `Pos` is line/ch and stays stable when content didn't change; we only re-mark ranges whose text didn't change.                                                  |
| `clearOnEnter` races with rapid typing                  | Validated in the spike (test 12, IME) and tests 4–7. If it misbehaves, fall back to manual cursor-range detection in `cursorActivity` and clear the marker explicitly.                                                  |
| Mode highlighting interaction                           | Validated in the spike (test 1, 4). `markText({replacedWith})` overrides visible content; CM mode highlighting still works underneath when the mark is dissolved.                                                       |
| Partial viewport state when only half an env is visible | Parser receives the visible viewport plus a hysteresis margin. For env-spanning constructs, only render when balance is known from visible/cached context — otherwise revert to source view (lists "fail-open" policy). |
| Switch state confuses collaborators                     | State is per-frame in `local_view_state` (localStorage); never sent through syncdb. Each collaborator sees their own state.                                                                                             |
| Existing chat/bookmark markers conflict                 | Chat uses gutter+bookmark; we use `markText({replacedWith})`. The `% chat:` / `% bookmark:` lines are comments and are skipped by the parser by the hard rule above.                                                    |
| AI dialog returns original text on cancel               | The AI accept path compares SHA of returned text to SHA at dialog open; equal ⇒ cancel/no-op. See "AI dialog accept path".                                                                                              |
| Marker handle stale when AI dialog returns              | `marker.find()` returns null ⇒ bail with toast. Also re-check the marker's current text SHA against the captured SHA — if they differ, a concurrent edit happened.                                                      |
| Custom macros silently mis-render                       | Default behavior is the unknown-macro chip with hover-source — no false rendering. Allowlist drives what gets a real widget.                                                                                            |
| `CodemirrorEditor` re-renders cycle the CM wrapper DOM  | The widget manager attaches once per CM instance (resolved through `actions._cm[id]`), not per wrapper re-render. Dispose only when the wrapper effect cleans up (richEditOff or unmount).                              |

## Open questions

1. **Format actions vs. selection mode.** When the Segmented control is on and a
   selection spans a widget boundary (selection starts in source text,
   ends inside a rendered `\textbf{…}`), what happens to format
   actions? Cleanest: dissolve the mark first whenever the selection
   strictly contains it. Nail down during Phase 2.
2. **Toolbar overflow on narrow frames.** In a three-pane split, the
   toolbar may wrap. Plan: collapse less-essential buttons into an
   overflow menu (antd `Dropdown`) below a width threshold.
3. **Visual distinction lstlisting vs. minted vs. verbatim.** All three
   are "preformatted block" widgets. Likely: small language badge in
   the top-right of `lstlisting`/`minted`. Confirm during Phase 6.
4. **First-run discoverability.** Once Phase 2 lands and the Segmented control is
   enabled, do we surface a one-time popover hint on the Segmented control? Or
   rely on the visible toolbar alone? Phase 7 decision.

## Notes

- The widget DOM is purely a view layer. The buffer remains canonical
  LaTeX. Saving, building, SyncTeX, line numbers, error gutters, and
  every other existing feature operate on the unchanged buffer.
- Collaborator cursors / selections are rendered by the existing CM
  cursor overlay. A peer's cursor inside one of our marked ranges
  appears at the boundary edge (same as for any other text marker)
  until the local user enters and dissolves the mark.
- No changes to `actions.ts`, `latexmk.ts`, the build pipeline, the PDF
  viewer, or any of the output-panel components.

## References

- [latex.md](latex.md) — current LaTeX editor architecture
- [frame-editors.md](frame-editors.md) — frame-editor framework
- [frontend.md](frontend.md) — frontend state management
- Existing chat-marker subsystem:
  - [latex-editor/chat-markers.ts](../packages/frontend/frame-editors/latex-editor/chat-markers.ts)
  - [latex-editor/chat-marker-gutter.tsx](../packages/frontend/frame-editors/latex-editor/chat-marker-gutter.tsx)
  - [latex-editor/actions.ts:3300-3450](../packages/frontend/frame-editors/latex-editor/actions.ts) (bookmark pattern — _not_ directly applicable; ordinal reuse doesn't transfer to viewport-scoped rescans)
- [code-editor/codemirror-gutter-marker.tsx](../packages/frontend/frame-editors/code-editor/codemirror-gutter-marker.tsx) — reference for `createRoot` + `FrameContext.Provider`
- [codemirror/extensions/ai-formula.tsx](../packages/frontend/codemirror/extensions/ai-formula.tsx) — AI formula dialog for math widget
- [components/markdown.tsx](../packages/frontend/components/markdown.tsx) — KaTeX rendering wrapper
- [sagews/sagews.coffee:791](../packages/frontend/sagews/sagews.coffee) — the only other place `markText({replacedWith})` is used today (legacy, no `clearOnEnter`)
