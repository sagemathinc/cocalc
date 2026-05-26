/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
RichEditToolbar — top bar of the LaTeX CodeMirror frame.

Layout (left → right):
  [ Source | Rich ] │ Section▾  B  I  U  ⟨/⟩  Math▾  🔗  List▾

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
import { useState } from "react";

import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

// localStorage key tracking whether the user has already seen the
// first-run popover that explains Source / Rich. Stored once per
// browser profile, never synced — purely a UX nudge.
const HINT_LS_KEY = "cocalc.latex-rich-edit.first-run-hint.seen";

function hasSeenHint(): boolean {
  try {
    if (typeof window === "undefined") return true;
    return window.localStorage?.getItem(HINT_LS_KEY) === "1";
  } catch {
    // localStorage can throw in private-mode Firefox / certain
    // sandboxed contexts. Err on the side of NOT pestering.
    return true;
  }
}

function markHintSeen(): void {
  try {
    window.localStorage?.setItem(HINT_LS_KEY, "1");
  } catch {
    // best-effort; if localStorage is unavailable the hint will
    // just show once per page load instead of once per browser.
  }
}

const MODE_SOURCE = "Source";
const MODE_RICH = "Rich";
type ViewMode = typeof MODE_SOURCE | typeof MODE_RICH;

const BAR_STYLE = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  padding: "4px 8px",
  borderBottom: `1px solid ${COLORS.GRAY_LL}`,
  background: COLORS.GRAY_LLL,
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
  editor_actions: any;
}

export function RichEditToolbar({ id, editor_actions }: Props) {
  // Per-frame view mode. Default Rich (so the feature is visible
  // immediately when the user opens a .tex file).
  const richMode: boolean =
    editor_actions?._get_frame_data?.(id, "richEditMode", true) !== false;
  const currentMode: ViewMode = richMode ? MODE_RICH : MODE_SOURCE;

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
    editor_actions?.set_frame_data?.({
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

  const headingItems = [
    { key: "format_heading_1", label: "Section" },
    { key: "format_heading_2", label: "Subsection" },
    { key: "format_heading_3", label: "Subsubsection" },
    { key: "format_heading_4", label: "Subsubsubsection" },
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

  return (
    <div style={BAR_STYLE} className="cc-latex-rich-edit-toolbar">
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
              <b>Rich</b> renders sections, formulas, lists, links, etc. inline
              as widgets. The raw LaTeX stays in the buffer — click any widget
              to dissolve back to source, hover to peek.
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
              options={[MODE_SOURCE, MODE_RICH]}
              value={currentMode}
              onChange={setMode}
            />
          </span>
        </Tooltip>
      </Popover>

      <Divider type="vertical" style={{ margin: "0 4px" }} />

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

      <Tooltip
        title="Verbatim block (\begin{verbatim}…\end{verbatim})"
        mouseEnterDelay={0.4}
      >
        <Button size="small" style={BTN_STYLE} onClick={fmt("format_code")}>
          <Icon name="code" />
        </Button>
      </Tooltip>

      <Dropdown
        menu={{
          items: mathItems,
          onClick: ({ key }) => dispatch(key),
        }}
        trigger={["click"]}
      >
        <Button size="small" style={BTN_STYLE}>
          <Icon name="tex" /> Math
        </Button>
      </Dropdown>

      <Tooltip title="Insert link (\href{…}{…})" mouseEnterDelay={0.4}>
        <Button size="small" style={BTN_STYLE} onClick={fmt("link")}>
          <Icon name="link" />
        </Button>
      </Tooltip>

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
    </div>
  );
}
