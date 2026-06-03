/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
RichEditToolbar — top bar of the LaTeX CodeMirror frame.

Layout (left → right):
  [ Source | Rich ] │ Section▾ Math▾ List▾ │ B I U Size▾ │ 🔗 ⟨/⟩ ⊞table

The bar never wraps: when the format controls don't fit (e.g. in a
narrow pane created by splitting), they collapse into a single
"Format" dropdown whose submenus mirror the individual controls. This
is driven by a ResizeObserver comparing the bar's natural content width
to its available width.

The Segmented control switches the per-frame view mode between
"Source" (raw LaTeX) and "Rich" (rendered widgets). State is
persisted via `editor_actions.set_frame_data` / `_get_frame_data` —
frame-tree local view state (per-user, per-frame, localStorage — not
synced to collaborators). Default mode: Rich.

Format buttons dispatch through `editor_actions.format_action(cmd)`,
which routes to the existing CodeMirror `edit_selection` extension
and applies the `tex:` command map from
`packages/frontend/editors/editor-button-bar.ts`. They work
regardless of view mode.

See `src/docs/latex-rich-edit-design.md`.
*/

import { Button, Divider, Dropdown, Popover, Segmented, Tooltip } from "antd";
import { useLayoutEffect, useRef, useState } from "react";

import { redux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

import { FONT_SIZE_EM } from "./font-size";

// Size menu: one entry per renderer-supported size (smallest → largest,
// the declaration order of FONT_SIZE_EM). Derived from the same map the
// widgets render with, so the menu and the rendering can't drift. Each
// key maps to a `font_size_<name>` wrap command in editor-button-bar.ts.
const SIZE_ITEMS = Object.keys(FONT_SIZE_EM).map((name) => ({
  key: `font_size_${name}`,
  label: `\\${name}`,
}));

// Whether the user has already seen the first-run popover that
// explains Source / Rich. Backed by the account `tours` list so the
// dismissal syncs across browsers/devices and can be reset from
// Account → Completed Tours. Registered in account/tours.tsx.
const HINT_TOUR_NAME = "latex-rich-edit";

function hasSeenHint(): boolean {
  // Treat "store not ready" as seen — err on the side of NOT pestering
  // (the account store is reliably loaded inside an open editor).
  return redux.getStore("account")?.isTourDone(HINT_TOUR_NAME) ?? true;
}

function markHintSeen(): void {
  redux.getActions("account")?.setTourDone(HINT_TOUR_NAME);
}

const MODE_SOURCE = "Source";
const MODE_RICH = "Rich";
type ViewMode = typeof MODE_SOURCE | typeof MODE_RICH;

const BAR_STYLE = {
  display: "flex",
  alignItems: "center",
  // Never wrap: extra frames make the editor narrow, and a wrapping
  // toolbar would eat into the editable content. Instead the format
  // controls collapse into a single "Format" dropdown (see `compact`).
  flexWrap: "nowrap",
  overflow: "hidden",
  padding: "4px 8px",
  borderBottom: `1px solid ${COLORS.GRAY_LL}`,
  background: COLORS.GRAY_LLL,
  flexShrink: 0,
  gap: 2,
} as const;

// Each area holds a group of controls and must NOT shrink, so the bar's
// scrollWidth reflects the true natural width — that's what the overflow
// measurement compares against clientWidth.
const AREA_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  gap: 2,
} as const;

const BTN_STYLE = {
  border: "none",
  background: "transparent",
  color: COLORS.GRAY_D,
} as const;

interface Props {
  id: string;
  /** Owning frame-tree actions — holds this leaf's per-frame data
   * (the Rich/Source mode). For an included-file pane this differs from
   * `editor_actions`; see index.tsx. */
  actions: any;
  /** Actions for the file shown in this pane — drives the format
   * buttons (they edit that file's buffer). Equals `actions` for the
   * main file. */
  editor_actions: any;
}

export function RichEditToolbar({ id, actions, editor_actions }: Props) {
  // Per-frame view mode. Default Rich (so the feature is visible
  // immediately when the user opens a .tex file). Read from the owning
  // frame tree (`actions`), not the file's editor_actions — see the
  // note in index.tsx about included-file panes.
  const richMode: boolean =
    actions?._get_frame_data?.(id, "richEditMode", true) !== false;
  const currentMode: ViewMode = richMode ? MODE_RICH : MODE_SOURCE;

  // Responsive layout: when the format controls don't fit, collapse
  // them into a single "Format" dropdown instead of wrapping the bar.
  // We compare the bar's natural content width (scrollWidth, with all
  // areas flex-shrink:0) against its available width (clientWidth).
  const barRef = useRef<HTMLDivElement>(null);
  const fullWidthRef = useRef(0);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (el == null) return;
    const measure = () => {
      const avail = el.clientWidth;
      if (!compact) {
        // Expanded: remember the natural width; collapse if it overflows.
        fullWidthRef.current = el.scrollWidth;
        if (el.scrollWidth > avail + 1) setCompact(true);
      } else if (fullWidthRef.current > 0 && avail >= fullWidthRef.current) {
        // Compact: only expand again once the full set provably fits —
        // the dead zone between the two thresholds prevents oscillation.
        setCompact(false);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);

  // First-run hint state — initialized once from localStorage.
  const [showHint, setShowHint] = useState<boolean>(() => !hasSeenHint());
  const dismissHint = () => {
    if (showHint) {
      setShowHint(false);
      markHintSeen();
    }
  };

  const setMode = (value: string | number) => {
    // Interacting with the toggle counts as "the user has seen it".
    dismissHint();
    // Persist on the owning frame tree (`actions`), so the choice sticks
    // even for an included-file pane (whose editor_actions is a child
    // tree that doesn't contain this leaf).
    actions?.set_frame_data?.({
      id,
      richEditMode: value === MODE_RICH,
    });
  };

  // Route format actions to THIS pane. format_action() resolves the
  // target CM via _get_active_id(), so when a toolbar button is
  // clicked in a non-active pane the format would otherwise apply to
  // whichever pane held focus last. The leaf's bubbling onClick also
  // calls set_active_id but it runs AFTER React's onClick handlers,
  // so we need to set it explicitly here before dispatching.
  const dispatch = (cmd: string) => {
    editor_actions?.set_active_id?.(id, true);
    void editor_actions?.format_action?.(cmd);
  };

  const fmt = (cmd: string) => () => dispatch(cmd);

  // Only the levels the rich parser renders as section widgets and that
  // map to valid LaTeX commands. (format_heading_4 in editor-button-bar
  // inserts `\subsubsubsection{}`, which is neither valid LaTeX nor a
  // parser-supported widget, so it's deliberately omitted here.)
  const headingItems = [
    { key: "format_heading_1", label: "Section" },
    { key: "format_heading_2", label: "Subsection" },
    { key: "format_heading_3", label: "Subsubsection" },
    { type: "divider" as const },
    { key: "format_heading_0", label: "Plain (remove heading)" },
  ];

  const mathItems = [
    { key: "equation", label: "Inline math  $…$" },
    { key: "display_equation", label: "Display math  $$…$$" },
  ];

  const listItems = [
    { key: "insertunorderedlist", label: "Bulleted list (itemize)" },
    { key: "insertorderedlist", label: "Numbered list (enumerate)" },
  ];

  // Everything to the right of the Segmented control, collapsed into one
  // menu for the compact (narrow) layout. Leaf keys are the same
  // format-action commands the expanded buttons dispatch.
  const formatMenuItems = [
    { key: "heading", label: "Heading", children: headingItems },
    { key: "math", label: "Math", children: mathItems },
    { key: "list", label: "List", children: listItems },
    { type: "divider" as const },
    { key: "bold", label: "Bold" },
    { key: "italic", label: "Italic" },
    { key: "underline", label: "Underline" },
    { key: "size", label: "Size", children: SIZE_ITEMS },
    { type: "divider" as const },
    { key: "link", label: "Insert link" },
    { key: "format_code", label: "Verbatim" },
    { key: "table_3x3", label: "Table (3×3)" },
  ];

  return (
    <div style={BAR_STYLE} ref={barRef} className="cc-latex-rich-edit-toolbar">
      <div style={AREA_STYLE}>
        <Popover
          open={showHint}
          onOpenChange={(open) => {
            if (!open) dismissHint();
          }}
          // Block hover-triggered re-opens once dismissed.
          trigger={[]}
          placement="bottomLeft"
          title="LaTeX rich preview"
          content={
            <div style={{ maxWidth: 320, fontSize: "0.92em" }}>
              <p style={{ marginTop: 0, marginBottom: 8 }}>
                <b>Rich</b> renders sections, formulas, lists, links, etc.
                inline as widgets. The raw LaTeX stays in the buffer — click any
                widget to dissolve back to source, hover to peek.
              </p>
              <p style={{ marginBottom: 12 }}>
                Toggle to <b>Source</b> for the unrendered view.
              </p>
              <div style={{ textAlign: "right" }}>
                <Button size="small" type="primary" onClick={dismissHint}>
                  Got it
                </Button>
              </div>
            </div>
          }
        >
          <Tooltip
            title={
              currentMode === MODE_RICH
                ? "Rich view — sections, formulas, etc. shown as rendered widgets. Click Source to return to raw LaTeX."
                : "Source view — raw LaTeX. Click Rich to render sections, formulas, etc. inline."
            }
            placement="bottom"
            mouseEnterDelay={0.2}
          >
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <Segmented
                size="small"
                // `title: ""` suppresses antd's per-item native browser
                // tooltip (it defaults to the label) — we already show the
                // richer explanation via the wrapping <Tooltip> above.
                options={[
                  { label: MODE_SOURCE, value: MODE_SOURCE, title: "" },
                  { label: MODE_RICH, value: MODE_RICH, title: "" },
                ]}
                value={currentMode}
                onChange={setMode}
              />
            </span>
          </Tooltip>
        </Popover>
      </div>

      <Divider type="vertical" style={{ margin: "0 4px", flexShrink: 0 }} />

      <div style={AREA_STYLE}>
        {compact ? (
          <Dropdown
            menu={{
              items: formatMenuItems,
              onClick: ({ key }) => dispatch(key),
            }}
            trigger={["click"]}
          >
            <Button size="small" style={BTN_STYLE}>
              <Icon name="edit" /> Format
            </Button>
          </Dropdown>
        ) : (
          <>
            <Dropdown
              menu={{
                items: headingItems,
                onClick: ({ key }) => dispatch(key),
              }}
              trigger={["click"]}
            >
              <Button size="small" style={BTN_STYLE}>
                <Icon name="header" /> Section
              </Button>
            </Dropdown>

            <Dropdown
              menu={{
                items: mathItems,
                onClick: ({ key }) => dispatch(key),
              }}
              trigger={["click"]}
            >
              <Button size="small" style={BTN_STYLE}>
                {/* A little formula reads clearer than the "tex" glyph,
                    which looked like the word "TeX". */}
                <span style={{ fontFamily: "serif" }}>
                  &radic;<span style={{ fontStyle: "italic" }}>x</span>
                </span>{" "}
                Math
              </Button>
            </Dropdown>

            <Dropdown
              menu={{
                items: listItems,
                onClick: ({ key }) => dispatch(key),
              }}
              trigger={["click"]}
            >
              <Button size="small" style={BTN_STYLE}>
                <Icon name="list" /> List
              </Button>
            </Dropdown>

            <Divider type="vertical" style={{ margin: "0 4px", flexShrink: 0 }} />

            <Tooltip title="Bold (\textbf{…})" mouseEnterDelay={0.4}>
              <Button size="small" style={BTN_STYLE} onClick={fmt("bold")}>
                <Icon name="bold" />
              </Button>
            </Tooltip>

            <Tooltip title="Italic (\textit{…})" mouseEnterDelay={0.4}>
              <Button size="small" style={BTN_STYLE} onClick={fmt("italic")}>
                <Icon name="italic" />
              </Button>
            </Tooltip>

            <Tooltip title="Underline (\underline{…})" mouseEnterDelay={0.4}>
              <Button size="small" style={BTN_STYLE} onClick={fmt("underline")}>
                <Icon name="underline" />
              </Button>
            </Tooltip>

            <Dropdown
              menu={{
                items: SIZE_ITEMS,
                onClick: ({ key }) => dispatch(key),
              }}
              trigger={["click"]}
            >
              <Button size="small" style={BTN_STYLE}>
                <Icon name="text-height" /> Size
              </Button>
            </Dropdown>

            <Divider type="vertical" style={{ margin: "0 4px", flexShrink: 0 }} />

            <Tooltip title="Insert link (\href{…}{…})" mouseEnterDelay={0.4}>
              <Button size="small" style={BTN_STYLE} onClick={fmt("link")}>
                <Icon name="link" />
              </Button>
            </Tooltip>

            <Tooltip
              title="Verbatim block (\begin{verbatim}…\end{verbatim})"
              mouseEnterDelay={0.4}
            >
              <Button
                size="small"
                style={BTN_STYLE}
                onClick={fmt("format_code")}
              >
                <Icon name="code" />
              </Button>
            </Tooltip>

            <Tooltip
              title="Insert 3×3 table (tabular)"
              mouseEnterDelay={0.4}
            >
              <Button
                size="small"
                style={BTN_STYLE}
                onClick={fmt("table_3x3")}
              >
                <Icon name="table" />
              </Button>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
