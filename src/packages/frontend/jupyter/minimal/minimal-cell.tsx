/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Dropdown, Tooltip } from "antd";
import type { Map } from "immutable";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { redux } from "@cocalc/frontend/app-framework";
import { Icon, isIconName } from "@cocalc/frontend/components";
import { jupyter } from "@cocalc/frontend/i18n";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { openAssistantWithPrefill } from "@cocalc/frontend/frame-editors/llm/assistant-seed";
import { clear_selection } from "@cocalc/frontend/misc/clear-selection";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import type { LLMTools } from "@cocalc/jupyter/types";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { FileContext, useFileContext } from "@cocalc/frontend/lib/file-context";
import { hash_string } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { CellOutput } from "@cocalc/frontend/jupyter/cell-output";
import { CellToolbar } from "@cocalc/frontend/jupyter/cell-toolbar";
import { CellInput } from "@cocalc/frontend/jupyter/cell-input";

import { LLMCellTool } from "@cocalc/frontend/jupyter/llm/cell-tool";
import { CodeBarDropdownMenu } from "@cocalc/frontend/jupyter/cell-buttonbar-menu";
import { MinimalCodePreview } from "./minimal-code-preview";
import { CODE_BAR_BTN_STYLE, RUN_ALL_CELLS_ABOVE_ICON, RUN_ALL_CELLS_BELOW_ICON } from "@cocalc/frontend/jupyter/consts";
import { MinimalGutter, type CellRunState, formatDuration, formatTimeAgo } from "./minimal-gutter";
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
  cell_toolbar?: string;
  positionInBlock: number;
  blockSize: number;
  headingLevel: number;
  blockCellIds?: string[];
  isFirst?: boolean;
  isLast?: boolean;
  isLastBlock?: boolean;
  sectionCollapsed?: boolean;
  onToggleSection?: () => void;
  sectionTitle?: string;
  blockHighlighted?: boolean;
  onHoverBlock?: (hover: boolean) => void;
  minimalLayout?: "wide" | "comfortable" | "narrow";
  zenMode?: boolean;
  frameHeight?: number;
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
      cell_toolbar,
      positionInBlock,
      blockSize,
      blockCellIds,
      isFirst,
      isLast,
      isLastBlock,
      sectionCollapsed,
      onToggleSection,
      sectionTitle,
      minimalLayout = "comfortable",
      zenMode = false,
      frameHeight,
    } = props;

    const intl = useIntl();
    const frameActions = useNotebookFrameActions();
    const fileContext = useFileContext();
    const [mdHovered, setMdHovered] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [rowHovered, setRowHovered] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);
    const [outputHeight, setOutputHeight] = useState<number>(0);

    // FileContext that suppresses CellButtonBar and other extras in minimal mode
    const minimalFileContext = { ...fileContext, disableExtraButtons: true };

    const cellType = cell.get("cell_type") || "code";
    const isCode = cellType === "code";
    const isMarkdown = cellType === "markdown";
    const input = cell.get("input") || "";
    const sourceHidden = !!cell.getIn(["metadata", "jupyter", "source_hidden"]);
    const isNotEditable = !cell.getIn(["metadata", "editable"], true);
    const isNotDeletable = !cell.getIn(["metadata", "deletable"], true);

    // Track whether cell input changed since last execution
    const lastExecHashRef = useRef<{ execCount: number | undefined; hash: number } | null>(null);
    const execCount = cell.get("exec_count");
    if (isCode && execCount != null && execCount !== lastExecHashRef.current?.execCount) {
      lastExecHashRef.current = { execCount, hash: hash_string(input) };
    }

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
      // Only "stale" for cells never executed in this session
      if (!cell.get("exec_count") && !output && lastExecHashRef.current == null) return "stale";
      return "idle";
    })();

    const isDirty = isCode && cellRunState === "idle" &&
      lastExecHashRef.current != null &&
      lastExecHashRef.current.hash !== hash_string(input);

    const handleRun = useCallback(() => {
      frameActions.current?.run_cell(id);
    }, [id]);

    const handleStop = useCallback(() => {
      actions?.signal("SIGINT");
    }, [actions]);

    const isBusy = cellRunState === "running" || cellRunState === "queued";

    const handleRunSectionAbove = useCallback(() => {
      if (!actions || !blockCellIds) return;
      const idx = blockCellIds.indexOf(id);
      if (idx <= 0) return;
      const cells_map = actions.store.get("cells");
      for (let i = 0; i < idx; i++) {
        const c = cells_map?.get(blockCellIds[i]);
        if (c && (c.get("cell_type") || "code") === "code") {
          frameActions.current?.run_cell(blockCellIds[i]);
        }
      }
    }, [actions, blockCellIds, id]);

    const handleRunSectionBelow = useCallback(() => {
      if (!actions || !blockCellIds) return;
      const idx = blockCellIds.indexOf(id);
      if (idx === -1) return;
      const cells_map = actions.store.get("cells");
      for (let i = idx; i < blockCellIds.length; i++) {
        const c = cells_map?.get(blockCellIds[i]);
        if (c && (c.get("cell_type") || "code") === "code") {
          frameActions.current?.run_cell(blockCellIds[i]);
        }
      }
    }, [actions, blockCellIds, id]);

    function renderRunDropdownButton(extraStyle?: React.CSSProperties) {
      const icon = isBusy ? "stop" : "step-forward";
      const label = isBusy ? "Stop" : "Run";
      const tooltip = isBusy ? "Interrupt execution" : runTooltip;
      const onClick = isBusy ? handleStop : handleRun;
      const btnStyle = isBusy
        ? { ...CODE_BAR_BTN_STYLE, color: COLORS.ANTD_RED, ...extraStyle }
        : { ...CODE_BAR_BTN_STYLE, ...extraStyle };

      const sectionIdx = blockCellIds?.indexOf(id) ?? -1;
      const hasSection = blockCellIds != null && blockCellIds.length > 1;

      const items: any[] = [];
      if (hasSection) {
        items.push(
          {
            key: "section-above",
            icon: <Icon name={RUN_ALL_CELLS_ABOVE_ICON} />,
            label: "Run above in section",
            disabled: sectionIdx <= 0,
            onClick: handleRunSectionAbove,
          },
          {
            key: "section-below",
            icon: <Icon name={RUN_ALL_CELLS_BELOW_ICON} rotate={"90"} />,
            label: "Run cell and below in section",
            onClick: handleRunSectionBelow,
          },
          { type: "divider" },
        );
      }
      items.push(
        {
          key: "all-above",
          icon: <Icon name={RUN_ALL_CELLS_ABOVE_ICON} />,
          label: intl.formatMessage(jupyter.commands.run_all_cells_above_menu),
          onClick: () => actions?.run_all_above_cell(id),
        },
        {
          key: "all-below",
          icon: <Icon name={RUN_ALL_CELLS_BELOW_ICON} rotate={"90"} />,
          label: intl.formatMessage(jupyter.commands.run_all_cells_below_menu),
          onClick: () => actions?.run_all_below_cell(id),
        },
      );

      return (
        <div>
          <Dropdown.Button
            size="small"
            type="text"
            trigger={["click"]}
            mouseLeaveDelay={1.5}
            icon={<Icon name="angle-down" />}
            onClick={onClick}
            menu={{ items }}
          >
            <Tooltip placement="top" title={tooltip}>
              <span style={btnStyle}>
                {isIconName(icon) && <Icon name={icon} />} {label}
              </span>
            </Tooltip>
          </Dropdown.Button>
        </div>
      );
    }

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

    // Click on cell to select (same as default notebook)
    const handleClickCell = useCallback((event: React.MouseEvent) => {
      if (event.shiftKey && !is_current) {
        clear_selection();
        frameActions.current?.select_cell_range(id);
        return;
      }
      frameActions.current?.activate_cell(id, {
        mode: "escape",
        clearSelection: true,
      });
    }, [id, is_current]);

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

    const cellStart = cell.get("start");
    const cellEnd = cell.get("end");
    const runTooltip = useMemo((): React.ReactNode => {
      if (cellStart != null && cellEnd != null && cellEnd > cellStart) {
        const duration = formatDuration(cellEnd - cellStart);
        const ago = formatTimeAgo(new Date(cellEnd));
        return <span>Took {duration}, {ago}</span>;
      }
      return "Run this cell";
    }, [cellStart, cellEnd]);

    // Measure output *content* height (not the flex-stretched container)
    const outputContentRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const el = outputContentRef.current;
      if (!el) return;
      const ro = new ResizeObserver(([entry]) => {
        setOutputHeight(entry.contentRect.height);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const viewportHalf = frameHeight ? Math.round(frameHeight * 0.5) : 400;
    // View mode: match output height (the code fades out if taller)
    const codePreviewMaxHeight = outputHeight || undefined;
    // Edit mode: max of output height and 50% viewport
    const codeEditMaxHeight = Math.max(outputHeight, viewportHalf);

    // Show section divider for the first cell in every block
    const isBlockStart = positionInBlock === 0;
    const showSectionDivider = isBlockStart;

    // Non-first cells in a collapsed section: render nothing
    if (sectionCollapsed && !isBlockStart) {
      return null;
    }

    // Cell is being edited when it's the current cell in edit mode
    const isActiveEditing = !zenMode && is_current && props.mode === "edit" && isCode;

    const outputFlex = isActiveEditing ? OUTPUT_FLEX_EDITING : OUTPUT_FLEX_DEFAULT;
    const codeFlex = isActiveEditing ? CODE_FLEX_EDITING : CODE_FLEX_DEFAULT;
    const showCode = !zenMode;
    // In zen + wide, don't render the empty code column — output goes full width
    const showCodeColumn = !zenMode || minimalLayout !== "wide";

    // Layout spacers: to center the output, left spacer must offset the code column
    const margin = minimalLayout === "narrow" ? 2 : 0;
    const leftSpacerFlex = minimalLayout === "wide" ? 0
      : (margin + CODE_FLEX_DEFAULT);
    const rightSpacerFlex = minimalLayout === "wide" ? 0
      : margin;
    const hasSpacer = leftSpacerFlex > 0;
    const contentFlex = OUTPUT_FLEX_DEFAULT + CODE_FLEX_DEFAULT;
    const wrapCentered = (content: React.ReactNode) => {
      if (!hasSpacer) return content;
      return (
        <div style={{ display: "flex" }}>
          <div style={{ flex: `${leftSpacerFlex} 1 0`, transition: COLUMN_TRANSITION }} />
          <div style={{ flex: `${contentFlex} 1 0`, minWidth: 0, transition: COLUMN_TRANSITION }}>
            {content}
          </div>
          {rightSpacerFlex > 0 && <div style={{ flex: `${rightSpacerFlex} 1 0`, transition: COLUMN_TRANSITION }} />}
        </div>
      );
    };

    const cmOpts = cm_options.get("options")?.toJS() ?? {};

    // Section divider bar — appears at the start of every section
    // In zen mode, add an empty spacer matching the code column so the bar
    // doesn't stretch into the empty code area.
    const sectionRunButton = !read_only && blockCellIds ? handleRunSection : undefined;
    const sectionDivider = showSectionDivider ? (
      <SectionDividerRow
        isFirst={isFirst}
        sectionCollapsed={sectionCollapsed}
        sectionTitle={sectionTitle}
        onToggle={onToggleSection}
        onRunSection={sectionRunButton}
        showCode={showCode}
        codeFlex={CODE_FLEX_DEFAULT}
        outputFlex={OUTPUT_FLEX_DEFAULT}
        zenMode={zenMode}
        minimalLayout={minimalLayout}
      />
    ) : null;

    // When collapsed, only show the divider bar
    // If this is the last section, add a [+] that unfolds and inserts
    if (sectionCollapsed && isBlockStart) {
      return wrapCentered(
        <>
          {sectionDivider}
          {isLastBlock && !read_only && actions && blockCellIds?.length && (
            <div style={{ padding: "8px 0 0 4px" }}>
              <Tooltip title="Add cell at end of this section" placement="right">
                <Button
                  type="text"
                  size="small"
                  icon={<Icon name="plus" />}
                  onClick={() => {
                    // Unfold the section first
                    onToggleSection?.();
                    // Insert after last cell in block
                    const lastId = blockCellIds[blockCellIds.length - 1];
                    const newId = actions.insert_cell_adjacent(lastId, 1);
                    // Focus and scroll to the new cell
                    if (newId) {
                      frameActions.current?.set_cur_id(newId);
                      frameActions.current?.scroll("cell visible");
                    }
                  }}
                  style={{ color: COLORS.GRAY_M }}
                />
              </Tooltip>
            </div>
          )}
        </>,
      );
    }

    return wrapCentered(
      <>
      {sectionDivider}
      <div
        style={CELL_ROW_STYLE}
        id={id}
        onMouseUp={is_current ? undefined : handleClickCell}
        onMouseEnter={() => setRowHovered(true)}
        onMouseLeave={() => setRowHovered(false)}
      >
        <MinimalGutter
          id={id}
          index={index}
          isCode={isCode}
          positionInBlock={positionInBlock}
          blockSize={blockSize}
          showBlockLine={true}

          cellRunState={cellRunState}
          onRun={isCode ? handleRun : undefined}
          onStop={isCode ? handleStop : undefined}
          onInsertCell={
            actions
              ? () => actions.insert_cell_adjacent(id, 1)
              : undefined
          }
          read_only={read_only}
          onToggleSection={onToggleSection}
          blockHighlighted={props.blockHighlighted}
          onHoverBlock={props.onHoverBlock}
          isCurrent={is_current}
          isSelected={props.is_selected}
          start={cell.get("start")}
          end={cell.get("end")}
          isDirty={isDirty}
          isNotEditable={isNotEditable}
          isNotDeletable={isNotDeletable}
        />

        {/* Content area — toolbar + output/code columns */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {cell_toolbar && actions && (
            <div className="minimal-cell-toolbar">
              <CellToolbar
                actions={actions}
                cell_toolbar={cell_toolbar}
                cell={cell}
              />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", flex: 1 }}>
        {/* Output column */}
        <div
          ref={outputRef}
          style={{
            flex: `${outputFlex} 1 0`,
            minWidth: 0,
            overflow: "hidden",
            transition: COLUMN_TRANSITION,
            padding: "4px 8px",
            position: "relative",
          }}
        >
          <div ref={outputContentRef}>
          {/* Zen mode: floating toolbar inside output area */}
          {zenMode && (
            <div
              style={{
                position: "absolute",
                top: "2px",
                right: "4px",
                zIndex: 5,
                display: "flex",
                gap: "2px",
                alignItems: "center",
                background: "rgba(255,255,255,0.85)",
                borderRadius: "4px",
                padding: "1px",
                visibility: rowHovered || menuOpen ? "visible" : "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {isCode && !read_only && renderRunDropdownButton()}
              {isCode && !read_only && llmTools && actions && (
                <LLMCellTool
                  id={id}
                  actions={actions}
                  llmTools={llmTools}
                  cellType="code"
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
          {isCode && cell.get("output") != null && (
            <ScrollToBottomOutput frameHeight={frameHeight}>
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
            </ScrollToBottomOutput>
          )}
          {isCode && cell.get("output") == null && !input.trim() && !read_only && !zenMode && (
            <div style={{ color: COLORS.GRAY_L, padding: "8px 4px", fontSize: "13px" }}>
              {"Write "}
              <a onClick={handleActivateCode} style={{ color: COLORS.GRAY_L }}>
                code
              </a>
              {", "}
              <a
                style={{ color: COLORS.GRAY_L }}
                onClick={() => {
                  frameActions.current?.set_selected_cell_type("markdown");
                  // Small delay so cell type change propagates before opening editor
                  setTimeout(() => {
                    frameActions.current?.switch_md_cell_to_edit(id);
                  }, 0);
                }}
              >
                text
              </a>
              {", or "}
              <a
                style={{ color: COLORS.GRAY_L }}
                onClick={() => {
                  if (!actions || !project_id) return;
                  const cellList = (actions as any).store?.get("cell_list");
                  const cellIds = cellList?.toJS() as string[] | undefined;
                  const cellIndex = cellIds ? cellIds.indexOf(id) : -1;
                  const cellLabel = cellIndex >= 0 ? `cell #${cellIndex + 1}` : "this cell";
                  openAssistantWithPrefill({
                    redux,
                    project_id,
                    path: (actions as any).path,
                    prompt: `Generate code in ${cellLabel} that does: `,
                  }).catch((err) =>
                    console.warn("openAssistantWithPrefill failed:", err),
                  );
                }}
              >
                generate using AI...
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
            <div style={{ position: "relative" }} className="minimal-code-editor">
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
          </div>{/* end outputContentRef */}
        </div>

        {/* Code column — hidden entirely in zen + wide mode */}
        {showCodeColumn && <div
          style={{
            flex: `${codeFlex} 1 0`,
            minWidth: 0,
            overflow: "visible",
            transition: COLUMN_TRANSITION,
            position: "relative",
            zIndex: 1,
            borderLeft: zenMode ? "none" : "1px solid #eee",
          }}
        >{showCode && (<>
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
                visibility: rowHovered || menuOpen ? "visible" : "hidden",
                position: "relative",
                zIndex: 2,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {!read_only && renderRunDropdownButton({ marginRight: "auto" })}
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
          {isCode && !isActiveEditing && !sourceHidden && (
            <MinimalCodePreview
              value={input}
              cmOptions={cmOpts}
              fontSize={font_size}
              onActivate={handleActivateCode}
              highlighted={rowHovered}
              maxHeight={codePreviewMaxHeight}
            />
          )}
          {isCode && !isActiveEditing && sourceHidden && (
            <div
              style={{
                color: COLORS.GRAY_L,
                fontSize: "14px",
                padding: "4px 8px",
                cursor: "pointer",
              }}
              title="Input is hidden — click to show"
              onClick={() => {
                actions?.toggle_jupyter_metadata_boolean(id, "source_hidden");
              }}
            >
              <Icon name="ellipsis" />
            </div>
          )}
          {isCode && isActiveEditing && (
            <div
              style={{
                position: "relative",
                maxHeight: `${codeEditMaxHeight}px`,
                overflowY: "auto",
                overflowX: "hidden",
              }}
              onBlur={(e) => {
                // Close editor when focus leaves the entire editing area
                // (but not when clicking buttons inside it)
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  handleCloseEditor();
                }
              }}
            >
              <FileContext.Provider value={minimalFileContext}>
                <div className="minimal-code-editor" style={{ position: "relative" }}>
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
                visibility: rowHovered || menuOpen ? "visible" : "hidden",
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
        </>)}
        </div>}
        </div>{/* end output+code row */}
        </div>{/* end content area */}

      </div>
      {isLast && !read_only && actions && (
        <div style={{ padding: "8px 0 0 4px" }}>
          <Tooltip title="Add cell at end" placement="right">
            <Button
              type="text"
              size="small"
              icon={<Icon name="plus" />}
              onClick={() => {
                const newId = actions.insert_cell_adjacent(id, 1);
                if (newId) {
                  frameActions.current?.set_cur_id(newId);
                  frameActions.current?.scroll("cell visible");
                }
              }}
              style={{ color: COLORS.GRAY_M }}
            />
          </Tooltip>
        </div>
      )}
      </>,
    );
  },
);

/** Wrapper that caps output height and auto-scrolls to bottom on changes */
function ScrollToBottomOutput({
  children,
  frameHeight,
}: {
  children: React.ReactNode;
  frameHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    // Defer initial scroll until after browser layout is complete
    const raf = requestAnimationFrame(scrollToBottom);
    // Re-scroll on any child DOM mutation (new output lines)
    const observer = new MutationObserver(() => {
      requestAnimationFrame(scrollToBottom);
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        maxHeight: frameHeight ? `${Math.round(frameHeight * 0.7)}px` : "70vh",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {children}
    </div>
  );
}

/** Section divider row — single hover state across output and code columns */
function SectionDividerRow({
  isFirst,
  sectionCollapsed,
  sectionTitle,
  onToggle,
  onRunSection,
  showCode,
  codeFlex,
  outputFlex,
  zenMode,
  minimalLayout,
}: {
  isFirst?: boolean;
  sectionCollapsed?: boolean;
  sectionTitle?: string;
  onToggle?: () => void;
  onRunSection?: () => void;
  showCode?: boolean;
  codeFlex: number;
  outputFlex: number;
  zenMode?: boolean;
  minimalLayout?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = hovered ? COLORS.GRAY_LL : COLORS.GRAY_LLL;
  const borderTop = isFirst ? undefined : `1px solid ${COLORS.GRAY_LL}`;
  const borderBottom = `1px solid ${COLORS.GRAY_LL}`;
  const segmentStyle: React.CSSProperties = {
    backgroundColor: bg,
    borderTop,
    borderBottom,
    transition: "background-color 150ms ease",
  };

  return (
    <div
      style={{ display: "flex", cursor: "pointer" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onToggle}
    >
      {/* Output column side */}
      <div
        style={{
          flex: `${outputFlex} 1 0`,
          display: "flex",
          alignItems: "center",
          minHeight: "24px",
          ...segmentStyle,
        }}
      >
        {/* Gutter-width area with toggle icon */}
        <div style={{
          width: "44px",
          minWidth: "44px",
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
          paddingLeft: "2px",
        }}>
          <Icon
            name={sectionCollapsed ? "plus-square" : "minus-square"}
            style={{ color: COLORS.GRAY_M, fontSize: "14px" }}
          />
        </div>
        {/* Title */}
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
        {/* Run button in zen mode (no code column) */}
        {onRunSection && !showCode && (
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
      {/* Code column side */}
      {showCode && (
        <div
          style={{
            flex: `${codeFlex} 1 0`,
            display: "flex",
            alignItems: "center",
            padding: "0 4px",
            ...segmentStyle,
          }}
        >
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
                  ...CODE_BAR_BTN_STYLE,
                  marginLeft: "auto",
                  visibility: hovered ? "visible" : "hidden",
                }}
              >
                Run
              </Button>
            </Tooltip>
          )}
        </div>
      )}
      {/* Empty spacer for zen + non-wide — no background so bar ends at output column */}
      {zenMode && minimalLayout !== "wide" && (
        <div style={{ flex: `${codeFlex} 1 0` }} />
      )}
    </div>
  );
}
