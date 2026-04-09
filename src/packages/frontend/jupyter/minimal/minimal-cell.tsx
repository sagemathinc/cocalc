/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import type { Map } from "immutable";
import React, { useCallback, useState } from "react";

import { Icon } from "@cocalc/frontend/components";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import type { LLMTools } from "@cocalc/jupyter/types";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { FileContext, useFileContext } from "@cocalc/frontend/lib/file-context";
import { COLORS } from "@cocalc/util/theme";
import { CellOutput } from "@cocalc/frontend/jupyter/cell-output";
import { CellInput } from "@cocalc/frontend/jupyter/cell-input";

import { LLMCellTool } from "@cocalc/frontend/jupyter/llm/cell-tool";
import { CodeBarDropdownMenu } from "@cocalc/frontend/jupyter/cell-buttonbar-menu";
import { MinimalCodePreview } from "./minimal-code-preview";
import { MinimalGutter, type CellRunState } from "./minimal-gutter";
import {
  CELL_ROW_STYLE,
  CODE_FLEX_DEFAULT,
  CODE_FLEX_EDITING,
  COLUMN_TRANSITION,
  OUTPUT_FLEX_DEFAULT,
  OUTPUT_FLEX_EDITING,
} from "./styles";

interface MinimalCellProps {
  id: string;
  index: number;
  cell: Map<string, any>;
  cm_options: Map<string, any>;
  actions?: JupyterActions;
  name?: string;
  font_size: number;
  project_id?: string;
  directory?: string;
  mode: "edit" | "escape";
  is_current?: boolean;
  is_selected?: boolean;
  is_markdown_edit?: boolean;
  is_focused?: boolean;
  is_visible?: boolean;
  more_output?: Map<string, any>;
  trust?: boolean;
  complete?: Map<string, any>;
  llmTools?: LLMTools;
  computeServerId?: number;
  read_only?: boolean;
  positionInBlock: number;
  blockSize: number;
  headingLevel: number;
  blockCellIds?: string[];
  isFirst?: boolean;
  sectionCollapsed?: boolean;
  onToggleSection?: () => void;
  sectionTitle?: string;
}

export const MinimalCell: React.FC<MinimalCellProps> = React.memo(
  (props) => {
    const {
      id,
      index,
      cell,
      cm_options,
      actions,
      name,
      font_size,
      project_id,
      directory,
      is_current,
      is_markdown_edit,
      is_focused,
      more_output,
      trust,
      complete,
      llmTools,
      computeServerId,
      read_only,
      positionInBlock,
      blockSize,
      headingLevel,
      blockCellIds,
      isFirst,
      sectionCollapsed,
      onToggleSection,
      sectionTitle,
    } = props;

    const frameActions = useNotebookFrameActions();
    const fileContext = useFileContext();
    const [mdHovered, setMdHovered] = useState(false);
    const [codeHovered, setCodeHovered] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // FileContext that suppresses CellButtonBar and other extras in minimal mode
    const minimalFileContext = { ...fileContext, disableExtraButtons: true };

    const cellType = cell.get("cell_type") || "code";
    const isCode = cellType === "code";
    const isMarkdown = cellType === "markdown";
    const input = cell.get("input") || "";

    // Determine cell execution state for gutter coloring
    const cellRunState: CellRunState = (() => {
      if (!isCode) return "markdown";
      const state = cell.get("state");
      if (state === "busy") return "running";
      if (state === "run" || state === "start") return "queued";
      // Check for error in output
      const output = cell.get("output");
      if (output) {
        for (const [, msg] of output) {
          if (msg?.get?.("traceback")) return "error";
        }
      }
      // Never been run
      if (!cell.get("exec_count") && !output) return "stale";
      return "idle";
    })();

    const handleRun = useCallback(() => {
      frameActions.current?.run_cell(id);
    }, [id]);

    const handleActivateCode = useCallback(() => {
      if (read_only) return;
      frameActions.current?.activate_cell(id, {
        mode: "edit",
        clearSelection: true,
      });
    }, [id, read_only]);

    const handleCloseEditor = useCallback(() => {
      frameActions.current?.activate_cell(id, {
        mode: "escape",
        clearSelection: true,
      });
    }, [id]);

    const handleRunAndClose = useCallback(() => {
      frameActions.current?.run_cell(id);
      frameActions.current?.activate_cell(id, {
        mode: "escape",
        clearSelection: true,
      });
    }, [id]);

    const handleToggleMdEdit = useCallback(() => {
      if (read_only) return;
      if (is_markdown_edit) {
        frameActions.current?.set_md_cell_not_editing(id);
      } else {
        frameActions.current?.switch_md_cell_to_edit(id);
      }
    }, [id, is_markdown_edit, read_only]);

    const handleRunSection = useCallback(() => {
      if (!actions || !blockCellIds) return;
      const cells_map = actions.store.get("cells");
      for (const cellId of blockCellIds) {
        const c = cells_map?.get(cellId);
        if (c && (c.get("cell_type") || "code") === "code") {
          frameActions.current?.run_cell(cellId);
        }
      }
    }, [actions, blockCellIds]);

    // Show section divider for the first cell in every block
    const isBlockStart = positionInBlock === 0;
    const showSectionDivider = isBlockStart;

    // Non-first cells in a collapsed section: render nothing
    if (sectionCollapsed && !isBlockStart) {
      return null;
    }

    // Cell is being edited when it's the current cell in edit mode
    const isActiveEditing = is_current && props.mode === "edit" && isCode;

    const outputFlex = isActiveEditing ? OUTPUT_FLEX_EDITING : OUTPUT_FLEX_DEFAULT;
    const codeFlex = isActiveEditing ? CODE_FLEX_EDITING : CODE_FLEX_DEFAULT;

    const cmOpts = cm_options.get("options")?.toJS() ?? {};

    // Section divider bar — appears at the start of every section
    const sectionDivider = showSectionDivider ? (
      <SectionBar
        isFirst={isFirst}
        sectionCollapsed={sectionCollapsed}
        sectionTitle={sectionTitle}
        onToggle={onToggleSection}
        onRunSection={!read_only && blockCellIds ? handleRunSection : undefined}
      />
    ) : null;

    // When collapsed, only show the divider bar
    if (sectionCollapsed && isBlockStart) {
      return <>{sectionDivider}</>;
    }

    return (
      <>
      {sectionDivider}
      <div
        style={CELL_ROW_STYLE}
        id={id}
      >
        <MinimalGutter
          id={id}
          index={index}
          isCode={isCode}
          positionInBlock={positionInBlock}
          blockSize={blockSize}
          showBlockLine={blockSize > 1}
          isLastInBlock={positionInBlock === blockSize - 1}
          cellRunState={cellRunState}
          onRun={isCode ? handleRun : undefined}
          onInsertCell={
            actions
              ? () => actions.insert_cell_adjacent(id, 1)
              : undefined
          }
          read_only={read_only}
        />

        {/* Output column */}
        <div
          style={{
            flex: `${outputFlex} 1 0`,
            minWidth: 0,
            overflow: "hidden",
            transition: COLUMN_TRANSITION,
            padding: "8px 8px",
          }}
        >
          {isCode && cell.get("output") != null && (
            <CellOutput
              cell={cell}
              actions={actions}
              name={name}
              id={id}
              project_id={project_id}
              directory={directory}
              more_output={more_output}
              trust={trust}
              hidePrompt
              llmTools={llmTools}
            />
          )}
          {isCode && cell.get("output") == null && !input.trim() && !read_only && (
            <div style={{ color: COLORS.GRAY_M, padding: "8px 4px", fontSize: "13px" }}>
              <a onClick={handleActivateCode} style={{ color: COLORS.GRAY_M }}>
                Write code
              </a>
            </div>
          )}
          {isMarkdown && !is_markdown_edit && (
            <div
              style={{ position: "relative", minHeight: "24px" }}
              onMouseEnter={() => setMdHovered(true)}
              onMouseLeave={() => setMdHovered(false)}
              onDoubleClick={handleToggleMdEdit}
            >
              {input.trim() ? (
                <>
                  <style>{`
                    .minimal-md-render h1 { font-size: 1.4em; margin: 4px 0; }
                    .minimal-md-render h2 { font-size: 1.2em; margin: 3px 0; }
                    .minimal-md-render h3 { font-size: 1.1em; margin: 2px 0; }
                    .minimal-md-render h4 { font-size: 1.05em; margin: 2px 0; }
                    .minimal-md-render p { margin: 4px 0; }
                  `}</style>
                  <div className="cocalc-jupyter-rendered cocalc-jupyter-rendered-md minimal-md-render">
                    <MostlyStaticMarkdown
                      value={input.trim()}
                      onChange={
                        read_only
                          ? undefined
                          : (value) => actions?.set_cell_input(id, value, true)
                      }
                    />
                  </div>
                </>
              ) : (
                <div
                  style={{
                    color: COLORS.GRAY_L,
                    padding: "4px",
                    fontStyle: "italic",
                    cursor: "pointer",
                  }}
                  onClick={handleToggleMdEdit}
                >
                  empty markdown
                </div>
              )}
              {(mdHovered || !input.trim()) && !read_only && (
                <Tooltip title="Edit this markdown cell" placement="top">
                  <Button
                    type="text"
                    size="small"
                    icon={<Icon name="pencil" />}
                    onClick={handleToggleMdEdit}
                    style={{
                      position: "absolute",
                      top: "2px",
                      right: "2px",
                      opacity: 0.7,
                    }}
                  />
                </Tooltip>
              )}
            </div>
          )}
          {isMarkdown && is_markdown_edit && (
            <div style={{ position: "relative" }}>
              <FileContext.Provider value={minimalFileContext}>
              <CellInput
                cell={cell}
                actions={actions}
                cm_options={cm_options}
                is_markdown_edit={true}
                is_focused={!!is_focused}
                is_current={!!is_current}
                id={id}
                index={index}
                font_size={font_size}
                project_id={project_id}
                directory={directory}
                trust={trust}
                is_readonly={!!read_only}
                input_is_readonly={!cell.getIn(["metadata", "editable"], true)}
              />
              </FileContext.Provider>
              <Tooltip title="Done editing" placement="top">
                <Button
                  type="text"
                  size="small"
                  icon={<Icon name="check" />}
                  onClick={handleToggleMdEdit}
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                  }}
                />
              </Tooltip>
            </div>
          )}
        </div>

        {/* Code column */}
        <div
          style={{
            flex: `${codeFlex} 1 0`,
            minWidth: 0,
            overflow: "hidden",
            transition: COLUMN_TRANSITION,
            position: "relative",
            borderLeft: positionInBlock === 0 && headingLevel > 0
              ? "none"
              : "1px solid #eee",
          }}
          onMouseEnter={() => setCodeHovered(true)}
          onMouseLeave={() => setCodeHovered(false)}
        >
          {/* Cell action toolbar — hover only, above code */}
          {isCode && !isActiveEditing && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "0 4px",
                minHeight: "22px",
                gap: "2px",
                alignItems: "center",
                visibility: codeHovered || menuOpen ? "visible" : "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {!read_only && llmTools && actions && (
                <LLMCellTool
                  id={id}
                  actions={actions}
                  llmTools={llmTools}
                  cellType={isCode ? "code" : "markdown"}
                />
              )}
              <CodeBarDropdownMenu
                actions={actions}
                frameActions={frameActions}
                id={id}
                cell={cell}
                onOpenChange={setMenuOpen}
              />
            </div>
          )}
          {isCode && !isActiveEditing && (
            <MinimalCodePreview
              value={input}
              cmOptions={cmOpts}
              fontSize={font_size}
              onActivate={handleActivateCode}
            />
          )}
          {isCode && isActiveEditing && (
            <div style={{ position: "relative" }}>
              <FileContext.Provider value={minimalFileContext}>
                <div className="minimal-code-editor" style={{ position: "relative" }}>
                {/* Hide the In[N] prompt in minimal mode */}
                <style>{`.minimal-code-editor [cocalc-test="cell-input"] > .hidden-xs { display: none !important; }`}</style>
                <CellInput
                  cell={cell}
                  actions={actions}
                  cm_options={cm_options}
                  is_markdown_edit={false}
                  is_focused={!!is_focused}
                  is_current={!!is_current}
                  id={id}
                  index={index}
                  font_size={font_size}
                  project_id={project_id}
                  directory={directory}
                  complete={complete}
                  trust={trust}
                  is_readonly={!!read_only}
                  input_is_readonly={!cell.getIn(["metadata", "editable"], true)}
                  computeServerId={computeServerId}
                  llmTools={llmTools}
                />
              </div>
              </FileContext.Provider>
              <div style={{
                position: "absolute",
                top: "4px",
                right: "4px",
                zIndex: 10,
                display: "flex",
                gap: "2px",
                background: "rgba(255,255,255,0.85)",
                borderRadius: "4px",
                padding: "1px",
              }}>
                <Tooltip title="Run cell and close editor" placement="top">
                  <Button
                    type="text"
                    size="small"
                    icon={<Icon name="play" />}
                    onClick={handleRunAndClose}
                  />
                </Tooltip>
                <Tooltip title="Close editor" placement="top">
                  <Button
                    type="text"
                    size="small"
                    icon={<Icon name="times" />}
                    onClick={handleCloseEditor}
                  />
                </Tooltip>
              </div>
            </div>
          )}
          {/* Markdown cell toolbar in code column — 3-dot menu for cell actions */}
          {isMarkdown && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "0 4px",
                minHeight: "22px",
                alignItems: "center",
                visibility: codeHovered || menuOpen ? "visible" : "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <CodeBarDropdownMenu
                actions={actions}
                frameActions={frameActions}
                id={id}
                cell={cell}
                onOpenChange={setMenuOpen}
              />
            </div>
          )}
        </div>

      </div>
      </>
    );
  },
);

/** Section divider bar with collapse toggle and hover-only Run button */
function SectionBar({
  isFirst,
  sectionCollapsed,
  sectionTitle,
  onToggle,
  onRunSection,
}: {
  isFirst?: boolean;
  sectionCollapsed?: boolean;
  sectionTitle?: string;
  onToggle?: () => void;
  onRunSection?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        backgroundColor: COLORS.GRAY_LLL,
        borderTop: isFirst ? undefined : `1px solid ${COLORS.GRAY_LL}`,
        borderBottom: `1px solid ${COLORS.GRAY_LL}`,
        cursor: "pointer",
        minHeight: "24px",
      }}
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Gutter-width area with toggle icon — aligned left near section line */}
      <div style={{
        width: "44px",
        minWidth: "44px",
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "center",
        paddingLeft: "2px",
      }}>
        <Icon
          name={sectionCollapsed ? "plus-square-o" : "minus-square-o"}
          style={{ color: COLORS.GRAY_M, fontSize: "14px" }}
        />
      </div>
      {/* Title in the output column area */}
      {sectionCollapsed && sectionTitle ? (
        <span style={{
          color: COLORS.GRAY_D,
          fontSize: "13px",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          padding: "0 8px",
        }}>
          {sectionTitle}
        </span>
      ) : <span style={{ flex: 1 }} />}
      {onRunSection && (
        <Tooltip title="Run all code cells in this section">
          <Button
            type="text"
            size="small"
            icon={<Icon name="play" />}
            onClick={(e) => {
              e.stopPropagation();
              onRunSection();
            }}
            style={{
              color: COLORS.GRAY_M,
              visibility: hovered ? "visible" : "hidden",
              marginRight: "4px",
            }}
          >
            Run
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
