/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Pure utility functions for the notebook agent:
- Constants
- Cell content fencing
- Context extraction (focused cell, cursor, selection)
- Context label builder
- Cell output extraction
- Tool block parsing
- Tool dispatcher (all 7 tools with live index refresh)
- Cell run (poll for completion)
- System prompt builder
*/

import { backtickSequence } from "@cocalc/frontend/markdown/util";
import {
  parseSearchReplaceBlocks,
  applySearchReplace,
} from "@cocalc/frontend/frame-editors/llm/coding-agent-utils";
import { splitCells } from "@cocalc/frontend/jupyter/llm/split-cells";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import type { JupyterEditorActions } from "./actions";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const TAG = "notebook-agent";
export const MAX_OUTPUT_CHARS = 4000;
export const CELL_RUN_POLL_MS = 500;
export const CELL_RUN_TIMEOUT_MS = 120_000;
export const MAX_TOOL_LOOPS = 10;
export const LARGE_CELL_THRESHOLD = 1000;
export const CONTEXT_WINDOW_RADIUS_LINES = 10;
export const MAX_CONTEXT_CELL_CHARS = 1800;
export const MAX_CONTEXT_SELECTION_CHARS = 500;
export const MAX_GET_CELLS_PER_CALL = 4;
export const MAX_GET_CELL_INPUT_CHARS = 1800;
export const MAX_GET_CELL_OUTPUT_CHARS = 600;
export const MAX_GET_CELLS_INPUT_CHARS = 500;
export const MAX_GET_CELLS_OUTPUT_CHARS = 250;
export const MAX_ASSISTANT_HISTORY_CHARS = 1600;
export const MAX_TOOL_RESULT_HISTORY_CHARS = 2400;

/* ------------------------------------------------------------------ */
/*  Cell content fencing                                               */
/* ------------------------------------------------------------------ */

/**
 * Fence cell content with backticks, using the appropriate language tag.
 * Code cells use the notebook language; markdown cells use "markdown".
 */
export function fenceCell(
  content: string,
  cellType: string,
  language: string,
): string {
  const lang = cellType === "code" ? language : "markdown";
  const open = backtickSequence(content, lang);
  const close = backtickSequence(content);
  return `${open}\n${content}\n${close}`;
}

/* ------------------------------------------------------------------ */
/*  Text truncation                                                    */
/* ------------------------------------------------------------------ */

export function truncate(s: string, maxLen: number = MAX_OUTPUT_CHARS): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `\n... (truncated, ${s.length} chars total)`;
}

export interface CellContextWindow {
  content: string;
  startLine: number; // 1-based
  endLine: number; // 1-based
  totalLines: number;
  truncated: boolean;
}

export function getCellContextWindow(
  content: string,
  {
    cursorLine,
    selectionRange,
    radiusLines = CONTEXT_WINDOW_RADIUS_LINES,
    maxChars = MAX_CONTEXT_CELL_CHARS,
  }: {
    cursorLine?: number;
    selectionRange?: { fromLine: number; toLine: number };
    radiusLines?: number;
    maxChars?: number;
  } = {},
): CellContextWindow {
  const lines = content.split("\n");
  const totalLines = lines.length;
  const anchorStart = Math.max(
    0,
    Math.min(selectionRange?.fromLine ?? cursorLine ?? 0, totalLines - 1),
  );
  const anchorEnd = Math.max(
    anchorStart,
    Math.min(
      selectionRange?.toLine ?? cursorLine ?? anchorStart,
      totalLines - 1,
    ),
  );

  let start = Math.max(0, anchorStart - radiusLines);
  let end = Math.min(totalLines - 1, anchorEnd + radiusLines);

  const currentWindow = () => lines.slice(start, end + 1).join("\n");

  while (
    (start < anchorStart || end > anchorEnd) &&
    currentWindow().length > maxChars
  ) {
    const before = anchorStart - start;
    const after = end - anchorEnd;
    if (after >= before && end > anchorEnd) {
      end--;
    } else if (start < anchorStart) {
      start++;
    } else if (end > anchorEnd) {
      end--;
    } else {
      break;
    }
  }

  let excerpt = currentWindow();
  let truncated = start > 0 || end < totalLines - 1;
  if (excerpt.length > maxChars) {
    excerpt = truncate(excerpt, maxChars);
    truncated = true;
  }

  return {
    content: excerpt,
    startLine: start + 1,
    endLine: end + 1,
    totalLines,
    truncated,
  };
}

/* ------------------------------------------------------------------ */
/*  Context types and extraction                                       */
/* ------------------------------------------------------------------ */

export interface NotebookContext {
  cellIndex?: number; // 1-based
  cellId?: string;
  cellType?: "code" | "markdown" | "raw";
  cellContent?: string;
  cursorLine?: number; // 0-based
  selection?: string;
  selectionRange?: { fromLine: number; toLine: number }; // 0-based
  selectedCellIndices?: number[]; // 1-based
  totalCells: number;
  kernelName: string;
  language: string;
}

/**
 * Extract notebook context (focused cell, cursor, selection) from
 * the JupyterEditorActions.  The agent runs in the chat frame, so
 * we must resolve the notebook frame via
 * _get_most_recent_active_frame_id_of_type("jupyter_cell_notebook").
 */
export function getNotebookContext(
  actions: JupyterEditorActions,
): NotebookContext {
  const jupyterActions: JupyterActions = (actions as any).jupyter_actions;
  const store = jupyterActions.store;

  const kernelName: string =
    (store?.getIn(["kernel_info", "display_name"]) as string) ?? "";
  const language: string =
    (store?.getIn(["kernel_info", "language"]) as string) ?? "";
  const cellList: string[] = store?.get("cell_list")?.toJS() ?? [];

  const base: NotebookContext = {
    totalCells: cellList.length,
    kernelName,
    language,
  };

  // Resolve notebook frame from the chat frame
  let notebookFrameId: string | undefined;
  try {
    notebookFrameId = (actions as any)._get_most_recent_active_frame_id_of_type(
      "jupyter_cell_notebook",
    );
  } catch {
    return base;
  }
  if (!notebookFrameId) return base;

  let frameActions: any;
  try {
    frameActions = actions.get_frame_actions(notebookFrameId);
  } catch {
    return base;
  }
  if (!frameActions) return base;

  const curId: string | undefined = frameActions.store?.get("cur_id");
  if (!curId) return base;

  const cellIndex1 = cellList.indexOf(curId);
  if (cellIndex1 === -1) return base;

  const cell = store?.getIn(["cells", curId]) as any;
  const cellType: "code" | "markdown" | "raw" =
    cell?.get("cell_type") ?? "code";
  const cellContent: string = cell?.get("input") ?? "";

  const ctx: NotebookContext = {
    ...base,
    cellIndex: cellIndex1 + 1, // 1-based
    cellId: curId,
    cellType,
    cellContent,
  };

  // Cursor position
  try {
    const cursor = frameActions.getCursorPosition?.(curId);
    if (cursor) {
      ctx.cursorLine = cursor.line;
    }
  } catch {
    // ignore
  }

  // Selection (code cells only — markdown/Slate doesn't support it)
  try {
    const sel = frameActions.getCellSelection?.(curId);
    if (sel) {
      ctx.selection = sel;
    }
  } catch {
    // ignore
  }

  // Selection range (code cells only)
  try {
    const range = frameActions.getSelectionRange?.(curId);
    if (range) {
      ctx.selectionRange = range;
    }
  } catch {
    // ignore
  }

  // Multi-cell selection
  try {
    const selectedIds: string[] =
      frameActions.store?.get_selected_cell_ids_list?.() ?? [];
    if (selectedIds.length > 1) {
      ctx.selectedCellIndices = selectedIds
        .map((id: string) => cellList.indexOf(id) + 1)
        .filter((i: number) => i > 0);
    }
  } catch {
    // ignore
  }

  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Context indicator label                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the human-readable context indicator string (shown in yellow bar).
 */
export function buildContextLabel(ctx: Partial<NotebookContext>): string {
  if (!ctx.cellIndex) return "";

  // Multi-cell selection
  if (ctx.selectedCellIndices && ctx.selectedCellIndices.length > 1) {
    const min = Math.min(...ctx.selectedCellIndices);
    const max = Math.max(...ctx.selectedCellIndices);
    return `Cells #${min}\u2013${max} selected`;
  }

  // Single-line selection with text
  if (ctx.selection && ctx.selectionRange) {
    const { fromLine, toLine } = ctx.selectionRange;
    if (fromLine === toLine) {
      const selText =
        ctx.selection.length > 60
          ? ctx.selection.slice(0, 57) + "..."
          : ctx.selection;
      return `Cell #${ctx.cellIndex}, line ${fromLine + 1}: "${selText}"`;
    }
    // Multi-line selection
    return `Cell #${ctx.cellIndex}, lines ${fromLine + 1}\u2013${toLine + 1} selected`;
  }

  // Cursor only
  if (ctx.cursorLine != null) {
    return `Cell #${ctx.cellIndex} (${ctx.cellType ?? "code"}), line ${ctx.cursorLine + 1}`;
  }

  // Cell only
  return `Cell #${ctx.cellIndex} (${ctx.cellType ?? "code"})`;
}

/* ------------------------------------------------------------------ */
/*  Cell output extraction                                             */
/* ------------------------------------------------------------------ */

export function getCellOutput(cell: any): string {
  const output = cell?.get("output");
  if (output == null) return "";
  const parts: string[] = [];
  try {
    output.forEach((msg: any) => {
      if (typeof msg?.get === "function") {
        const text = msg.get("text");
        if (text) parts.push(text);
        const data = msg.get("data");
        if (data) {
          const plain = data.get("text/plain");
          if (plain) parts.push(plain);
        }
        const ename = msg.get("ename");
        if (ename) {
          parts.push(
            `${ename}: ${msg.get("evalue") ?? ""}\n${(msg.get("traceback")?.toJS?.() ?? []).join("\n")}`,
          );
        }
      }
    });
  } catch {
    parts.push("[unable to read output]");
  }
  return parts.join("");
}

/* ------------------------------------------------------------------ */
/*  Tool block parsing                                                 */
/* ------------------------------------------------------------------ */

export interface ToolCall {
  name: string;
  args: Record<string, any>;
}

export function parseToolBlocks(text: string): ToolCall[] {
  const blocks: ToolCall[] = [];
  // The closing ``` must be on its own line (^ with multiline flag).
  // This prevents the regex from matching backticks embedded inside
  // JSON string values (e.g. cells_markdown containing code fences).
  const regex = /^```tool\n([\s\S]*?)\n```\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name) {
        blocks.push({ name: parsed.name, args: parsed.args ?? {} });
      }
    } catch {
      // Skip malformed tool blocks
    }
  }
  return blocks;
}

export function compactAssistantMessageForHistory(text: string): string {
  const toolCalls = parseToolBlocks(text);
  const prose = text
    .replace(/^```tool\n[\s\S]*?\n```\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const toolSummary =
    toolCalls.length > 0
      ? `[Used tools: ${toolCalls.map(({ name }) => name).join(", ")}]`
      : "";

  if (!prose) {
    return toolSummary || truncate(text, MAX_ASSISTANT_HISTORY_CHARS);
  }

  const compactProse = truncate(prose, MAX_ASSISTANT_HISTORY_CHARS);
  return toolSummary ? `${compactProse}\n\n${toolSummary}` : compactProse;
}

export function compactToolResultForHistory(text: string): string {
  return truncate(text, MAX_TOOL_RESULT_HISTORY_CHARS);
}

/* ------------------------------------------------------------------ */
/*  Index resolution                                                   */
/* ------------------------------------------------------------------ */

// PendingRun removed — cells now run immediately without confirmation.

/**
 * Convert a 1-based index to 0-based with bounds check.
 * Returns { idx, cellId } on success, or { error } on failure.
 */
export function resolveIndex(
  index1: number,
  cellList: string[],
): { idx: number; cellId: string } | { error: string } {
  if (typeof index1 !== "number" || isNaN(index1)) {
    return { error: `Invalid index: ${index1} (expected a number)` };
  }
  const idx = index1 - 1;
  if (idx < 0 || idx >= cellList.length) {
    return {
      error: `Index ${index1} out of range (1..${cellList.length})`,
    };
  }
  return { idx, cellId: cellList[idx] };
}

/* ------------------------------------------------------------------ */
/*  Tool dispatcher — shared helpers                                   */
/* ------------------------------------------------------------------ */

interface ToolHandlerContext {
  args: Record<string, any>;
  cellList: string[];
  jupyterActions: JupyterActions;
  language: string;
  cancelRef?: { current: boolean };
}

function jsonResult(data: Record<string, any>): string {
  return JSON.stringify(data);
}

function readCellSummary(
  cell: any,
  index: number,
  language: string,
  maxInput: number = MAX_OUTPUT_CHARS,
  maxOutput: number = MAX_OUTPUT_CHARS,
): string {
  const cellType = cell.get("cell_type") ?? "code";
  const input = cell.get("input") ?? "";
  const output = getCellOutput(cell);
  const window = getCellContextWindow(input, { maxChars: maxInput });
  return (
    `Cell #${index} (${cellType}):\n` +
    (window.truncated
      ? `Input excerpt (lines ${window.startLine}-${window.endLine} of ${window.totalLines}):\n`
      : "") +
    fenceCell(window.content, cellType, language) +
    (output ? `\nOutput: ${truncate(output, maxOutput)}` : "")
  );
}

function resolveCell(
  store: any,
  cellList: string[],
  index: number,
): { cellId: string; cell: any } | string {
  const res = resolveIndex(index, cellList);
  if ("error" in res) return jsonResult(res);
  const cell = store.getIn(["cells", res.cellId]) as any;
  if (!cell) return jsonResult({ error: "Cell not found" });
  return { cellId: res.cellId, cell };
}

/* ------------------------------------------------------------------ */
/*  Tool dispatcher — per-tool handlers                                */
/* ------------------------------------------------------------------ */

type ToolHandler = (ctx: ToolHandlerContext) => Promise<string>;

const toolHandlers: Record<string, ToolHandler> = {
  cell_count: async ({ cellList }) => {
    return jsonResult({ cell_count: cellList.length });
  },

  get_cell: async ({ args, cellList, jupyterActions, language }) => {
    const store = jupyterActions.store;
    const res = resolveIndex(args.index, cellList);
    if ("error" in res) return jsonResult(res);
    const cell = store.getIn(["cells", res.cellId]) as any;
    if (!cell) return jsonResult({ error: "Cell not found" });
    const cellType = cell.get("cell_type") ?? "code";
    const input = cell.get("input") ?? "";
    const output = getCellOutput(cell);
    const aroundLine =
      typeof args.around_line === "number" ? Math.max(1, args.around_line) : 1;
    const window = getCellContextWindow(input, {
      cursorLine: aroundLine - 1,
      maxChars: MAX_GET_CELL_INPUT_CHARS,
    });
    return (
      `Cell #${args.index} (${cellType}):\n` +
      (window.truncated
        ? `Input excerpt (lines ${window.startLine}-${window.endLine} of ${window.totalLines}, centered near line ${aroundLine}):\n`
        : "") +
      fenceCell(window.content, cellType, language) +
      (output
        ? `\n\nOutput:\n${truncate(output, MAX_GET_CELL_OUTPUT_CHARS)}`
        : "\n\n(no output)")
    );
  },

  get_cells: async ({ args, cellList, jupyterActions, language }) => {
    const store = jupyterActions.store;
    const start = args.start ?? 1;
    const requestedEnd = args.end ?? cellList.length;
    const end = Math.min(
      requestedEnd,
      start + MAX_GET_CELLS_PER_CALL - 1,
      cellList.length,
    );
    const parts: string[] = [];
    for (let i = start; i <= end && i <= cellList.length; i++) {
      const res = resolveIndex(i, cellList);
      if ("error" in res) continue;
      const cell = store.getIn(["cells", res.cellId]) as any;
      if (!cell) continue;
      parts.push(
        readCellSummary(
          cell,
          i,
          language,
          MAX_GET_CELLS_INPUT_CHARS,
          MAX_GET_CELLS_OUTPUT_CHARS,
        ),
      );
    }
    if (parts.length === 0) return "(no cells in range)";
    if (requestedEnd > end) {
      return truncate(
        `Requested cells #${start}-${requestedEnd} were truncated to ` +
          `#${start}-#${end} to keep context small.\n\n${parts.join("\n\n")}`,
        MAX_TOOL_RESULT_HISTORY_CHARS,
      );
    }
    return truncate(parts.join("\n\n"), MAX_TOOL_RESULT_HISTORY_CHARS);
  },

  set_cell: async ({ args, cellList, jupyterActions }) => {
    const resolved = resolveCell(jupyterActions.store, cellList, args.index);
    if (typeof resolved === "string") return resolved;
    jupyterActions.set_cell_input(resolved.cellId, args.content ?? "", true);
    return jsonResult({
      status: "updated",
      index: args.index,
      id: resolved.cellId,
    });
  },

  edit_cell: async ({ args, cellList, jupyterActions }) => {
    const resolved = resolveCell(jupyterActions.store, cellList, args.index);
    if (typeof resolved === "string") return resolved;
    const currentInput: string = resolved.cell.get("input") ?? "";
    const blocks = parseSearchReplaceBlocks(args.edits ?? "");
    if (blocks.length === 0) {
      return jsonResult({ error: "No valid search/replace blocks found" });
    }
    const { result, applied, failed } = applySearchReplace(
      currentInput,
      blocks,
    );
    if (applied > 0) {
      jupyterActions.set_cell_input(resolved.cellId, result, true);
    }
    return jsonResult({
      status: applied > 0 ? "updated" : "no_changes",
      applied,
      failed,
      index: args.index,
      id: resolved.cellId,
    });
  },

  insert_cells: async ({ args, cellList, jupyterActions }) => {
    const store = jupyterActions.store;
    const afterIndex1: number = args.after_index ?? 0;
    const cellsMarkdown: string = args.cells_markdown ?? "";
    const parsed = splitCells(cellsMarkdown);
    if (parsed.length === 0) {
      return jsonResult({ error: "No cells parsed from input" });
    }

    const inserted: { index: number; id: string; cell_type: string }[] = [];
    let prevId: string | undefined;

    if (afterIndex1 === 0) {
      // Insert before the first cell.  We set prevId to undefined here
      // and handle the first insertion specially below using
      // insert_cell_adjacent(cellList[0], -1) to avoid a pos=0
      // collision with the existing first cell.
      prevId = undefined;
    } else {
      const res = resolveIndex(afterIndex1, cellList);
      if ("error" in res) return jsonResult(res);
      prevId = res.cellId;
    }

    for (const { cell_type, source } of parsed) {
      let newId: string;
      if (prevId == null) {
        // First insertion at the beginning: use insert_cell_adjacent
        // with delta=-1 to get a position before the first cell.
        // insert_cell_at(0) would create a pos=0 collision with the
        // existing first cell, producing undefined ordering.
        if (cellList.length > 0) {
          newId = jupyterActions.insert_cell_adjacent(cellList[0], -1, true);
        } else {
          newId = jupyterActions.insert_cell_at(0, true);
        }
      } else {
        newId = jupyterActions.insert_cell_adjacent(prevId, 1, true);
      }
      if (cell_type !== "code") {
        jupyterActions.set_cell_type(newId, cell_type);
      }
      const content = source.join("");
      if (content) {
        jupyterActions.set_cell_input(newId, content, true);
      }
      // Get updated cell list for index
      const updatedList: string[] = store.get("cell_list")?.toJS() ?? [];
      const newIndex1 = updatedList.indexOf(newId) + 1;
      inserted.push({ index: newIndex1, id: newId, cell_type });
      prevId = newId;
    }

    return jsonResult({ status: "inserted", cells: inserted });
  },

  run_cell: async ({ args, cellList, jupyterActions, cancelRef }) => {
    const res = resolveIndex(args.index, cellList);
    if ("error" in res) return jsonResult(res);
    // Only code cells can be executed — markdown/raw cells are no-ops
    // in JupyterActions.run_cell(), which would cause the polling loop
    // to wait until the 2-minute timeout.
    const cellType =
      jupyterActions.store
        .getIn(["cells", res.cellId, "cell_type"])
        ?.toString() ?? "code";
    if (cellType !== "code") {
      return jsonResult({
        error: `Cell ${args.index} is a ${cellType} cell and cannot be executed. Only code cells can be run.`,
      });
    }
    return await runCell(jupyterActions, res.cellId, args.index, cancelRef);
  },
};

/* ------------------------------------------------------------------ */
/*  Tool dispatcher — batch runner                                     */
/* ------------------------------------------------------------------ */

const MUTATING_TOOLS = new Set([
  "set_cell",
  "edit_cell",
  "insert_cells",
  "run_cell",
]);

function scrollToCell(
  editorActions: JupyterEditorActions | undefined,
  cellId: string,
): void {
  if (!editorActions) return;
  try {
    const frameId = (
      editorActions as any
    )._get_most_recent_active_frame_id_of_type("jupyter_cell_notebook");
    if (!frameId) return;
    const frameActions = editorActions.get_frame_actions(frameId);
    if (frameActions?.set_cur_id) {
      frameActions.set_cur_id(cellId);
    }
  } catch {
    // Best-effort — scrolling is not critical
  }
}

/**
 * Run a batch of tool calls, re-reading cell_list after any mutation.
 * Scrolls the notebook to show the affected cell after each mutation.
 *
 * @param cancelRef — when `.current` becomes `true`, the batch aborts
 *   early and any in-progress `runCell` poll stops immediately.
 */
export async function runToolBatch(
  toolCalls: ToolCall[],
  jupyterActions: JupyterActions,
  language: string,
  editorActions?: JupyterEditorActions,
  cancelRef?: { current: boolean },
  autoRun?: boolean,
): Promise<string[]> {
  const store = jupyterActions.store;
  let cellList: string[] = store.get("cell_list")?.toJS() ?? [];
  const results: string[] = [];

  for (const tc of toolCalls) {
    // Check for cancellation between tool calls so we don't
    // run the next tool (potentially a 120s runCell) after Stop.
    if (cancelRef?.current) break;

    let affectedCellId: string | undefined;
    const affectedCellIds: string[] = [];
    try {
      const result = await runSingleTool(
        tc,
        jupyterActions,
        cellList,
        language,
        cancelRef,
      );
      results.push(`**${tc.name}**: ${result}`);

      // Extract the affected cell ID(s) directly from the tool result.
      if (MUTATING_TOOLS.has(tc.name)) {
        try {
          const parsed = JSON.parse(result);
          if (parsed.id) {
            affectedCellId = parsed.id;
            affectedCellIds.push(parsed.id);
          } else if (parsed.cells?.length > 0) {
            for (const c of parsed.cells) {
              if (c.id) affectedCellIds.push(c.id);
            }
            affectedCellId = affectedCellIds[affectedCellIds.length - 1];
          }
        } catch {
          // Non-JSON result — skip
        }
      }
    } catch (err: any) {
      results.push(`**${tc.name}**: Error \u2014 ${err.message ?? err}`);
    }

    // Re-read cell list after any mutation
    if (MUTATING_TOOLS.has(tc.name)) {
      cellList = store.get("cell_list")?.toJS() ?? [];
    }

    // Scroll to the affected cell
    if (affectedCellId) {
      scrollToCell(editorActions, affectedCellId);
    }

    // Auto-run: after insert/set/edit (not run_cell itself), queue
    // affected code cells for execution.
    if (
      autoRun &&
      tc.name !== "run_cell" &&
      MUTATING_TOOLS.has(tc.name) &&
      affectedCellIds.length > 0
    ) {
      for (const cid of affectedCellIds) {
        const cellType = store.getIn(["cells", cid, "cell_type"]) ?? "code";
        if (cellType === "code") {
          jupyterActions.run_cell(cid);
        }
      }
    }
  }

  return results;
}

async function runSingleTool(
  toolCall: ToolCall,
  jupyterActions: JupyterActions,
  cellList: string[],
  language: string,
  cancelRef?: { current: boolean },
): Promise<string> {
  const handler = toolHandlers[toolCall.name];
  if (!handler) {
    return jsonResult({ error: `Unknown tool: ${toolCall.name}` });
  }
  return handler({
    args: toolCall.args,
    cellList,
    jupyterActions,
    language,
    cancelRef,
  });
}

/* ------------------------------------------------------------------ */
/*  Cell run                                                           */
/* ------------------------------------------------------------------ */

/**
 * Run a cell and poll until completion or timeout.
 * Returns the output as a string.
 *
 * Cell state lifecycle: undefined/"done" → "start" → "busy" → "done".
 * `run_cell` sets state to "start" synchronously.  We poll until the
 * cell reaches state "done" (the default for cells that aren't running)
 * AND has an `end` timestamp ≥ our invocation time — proving *this*
 * execution completed, not a stale previous one.
 */
export async function runCell(
  jupyterActions: JupyterActions,
  cellId: string,
  cellIndex: number,
  cancelRef?: { current: boolean },
): Promise<string> {
  // Cell end timestamps are set by the project process (server clock).
  // Allow a tolerance margin so a forward-skewed browser clock doesn't
  // make `end >= invokedAt` permanently false.
  const CLOCK_SKEW_TOLERANCE_MS = 5000;
  const invokedAt = Date.now() - CLOCK_SKEW_TOLERANCE_MS;
  jupyterActions.run_cell(cellId, true);

  const store = jupyterActions.store;
  const deadline = Date.now() + CELL_RUN_TIMEOUT_MS;

  const timedOut = await new Promise<boolean>((resolve) => {
    const check = () => {
      // Abort immediately when cancelled — don't keep polling for
      // up to 120s after the user clicks Stop or the component unmounts.
      if (cancelRef?.current) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(true);
        return;
      }
      const cell = store.getIn(["cells", cellId]) as any;
      const state = cell?.get("state");
      const end = cell?.get("end");
      // Cell is finished when state is "done" (or absent, which defaults
      // to "done") AND has an end timestamp from *this* execution.
      if ((!state || state === "done") && end != null && end >= invokedAt) {
        resolve(false);
        return;
      }
      setTimeout(check, CELL_RUN_POLL_MS);
    };
    // First check after a short delay — run_cell sets "start" synchronously
    // but we need to give the kernel a moment to begin.
    setTimeout(check, CELL_RUN_POLL_MS);
  });

  const cell = store.getIn(["cells", cellId]) as any;
  const output = cell ? getCellOutput(cell) : "";
  return jsonResult({
    status: timedOut ? "timeout" : "completed",
    index: cellIndex,
    id: cellId,
    output: truncate(output),
  });
}

/* ------------------------------------------------------------------ */
/*  System prompt builder                                              */
/* ------------------------------------------------------------------ */

export function buildSystemPrompt(ctx: NotebookContext): string {
  const lines: string[] = [];

  // 1. Role
  lines.push("You are an AI assistant for a Jupyter notebook.");
  lines.push("");

  // 2. Kernel info
  lines.push(
    `Kernel: "${ctx.kernelName || "unknown"}". Programming language: "${ctx.language || "unknown"}".`,
  );

  // 3. Overview
  lines.push(`The notebook has ${ctx.totalCells} cells.`);
  lines.push("");

  // 4. Focused cell context
  if (ctx.cellIndex != null && ctx.cellContent != null) {
    const contextWindow = getCellContextWindow(ctx.cellContent, {
      cursorLine: ctx.cursorLine,
      selectionRange: ctx.selectionRange,
      maxChars: MAX_CONTEXT_CELL_CHARS,
    });
    lines.push(`## Current Context`);
    lines.push("");
    lines.push(
      `You are looking at Cell #${ctx.cellIndex} (${ctx.cellType ?? "code"}):`,
    );
    if (contextWindow.truncated) {
      lines.push(
        `Showing lines ${contextWindow.startLine}-${contextWindow.endLine} of ${contextWindow.totalLines} to keep the prompt small.`,
      );
    }
    lines.push(
      fenceCell(contextWindow.content, ctx.cellType ?? "code", ctx.language),
    );

    if (ctx.cursorLine != null) {
      lines.push(`Cursor is at line ${ctx.cursorLine + 1}.`);
    }
    if (ctx.selection && ctx.selectionRange) {
      const truncatedSelection = truncate(
        ctx.selection,
        MAX_CONTEXT_SELECTION_CHARS,
      );
      const { fromLine, toLine } = ctx.selectionRange;
      if (fromLine === toLine) {
        lines.push(
          `Selected text (line ${fromLine + 1}): "${truncatedSelection}"`,
        );
      } else {
        lines.push(
          `Selected text (lines ${fromLine + 1}\u2013${toLine + 1}):\n${truncatedSelection}`,
        );
      }
    }
    if (ctx.selectedCellIndices && ctx.selectedCellIndices.length > 1) {
      const min = Math.min(...ctx.selectedCellIndices);
      const max = Math.max(...ctx.selectedCellIndices);
      lines.push(`Multiple cells selected: #${min}\u2013#${max}.`);
    }
    lines.push("");
  }

  // 5. Tool documentation
  lines.push("## Available Tools");
  lines.push("");
  lines.push(
    'To interact with the notebook, emit tool blocks in your response. Each tool block starts with \\`\\`\\`tool on its own line, followed by a JSON object with "name" and "args", then a closing \\`\\`\\`.',
  );
  lines.push("");
  lines.push("All cell indices are **1-based**. Ranges are **inclusive**.");
  lines.push("");

  lines.push("### cell_count");
  lines.push("Get the total number of cells.");
  lines.push("```tool");
  lines.push('{"name": "cell_count", "args": {}}');
  lines.push("```");
  lines.push("");

  lines.push("### get_cell");
  lines.push("Get a single cell's input and output.");
  lines.push(
    "Large cells are returned as a small context window, optionally centered near `around_line`.",
  );
  lines.push("```tool");
  lines.push('{"name": "get_cell", "args": {"index": 1, "around_line": 25}}');
  lines.push("```");
  lines.push("");

  lines.push("### get_cells");
  lines.push("Get a range of cells (both start and end are inclusive).");
  lines.push("```tool");
  lines.push('{"name": "get_cells", "args": {"start": 1, "end": 5}}');
  lines.push("```");
  lines.push("");

  lines.push("### set_cell");
  lines.push(
    "Replace the full contents of a cell. Use for cells under ~1000 characters.",
  );
  lines.push("```tool");
  lines.push(
    '{"name": "set_cell", "args": {"index": 1, "content": "new code here"}}',
  );
  lines.push("```");
  lines.push("");

  lines.push("### edit_cell");
  lines.push(
    "Apply search/replace patches to a cell. Use for cells of ~1000+ characters.",
  );
  lines.push(
    "The `edits` string contains one or more `<<<SEARCH` / `>>>REPLACE` / `<<<END` blocks:",
  );
  lines.push("```tool");
  lines.push(
    '{"name": "edit_cell", "args": {"index": 3, "edits": "<<<SEARCH\\nold code\\n>>>REPLACE\\nnew code\\n<<<END"}}',
  );
  lines.push("```");
  lines.push("");

  lines.push("### insert_cells");
  lines.push(
    "Insert one or more cells after the given index. Use `after_index: 0` to insert at the beginning.",
  );
  lines.push(
    "The `cells_markdown` string alternates fenced code blocks (for code cells) and plain text (for markdown cells):",
  );
  lines.push("```tool");
  lines.push(
    '{"name": "insert_cells", "args": {"after_index": 2, "cells_markdown": "```\\nprint(\'hello\')\\n```\\nThis is a markdown cell.\\n```\\nx = 42\\n```"}}',
  );
  lines.push("```");
  lines.push("");

  lines.push("### run_cell");
  lines.push(
    "Run a cell and return its output. The cell is executed immediately.",
  );
  lines.push("```tool");
  lines.push('{"name": "run_cell", "args": {"index": 4}}');
  lines.push("```");
  lines.push("");

  // 6. Edit rules
  lines.push("## Editing Rules");
  lines.push("");
  lines.push(
    "- For cells under ~1000 characters, use `set_cell` with the full replacement content.",
  );
  lines.push(
    "- For larger cells (~1000+ characters), use `edit_cell` with `<<<SEARCH`/`>>>REPLACE`/`<<<END` blocks.",
  );
  lines.push(
    "- To insert multiple consecutive cells (code and/or markdown), use `insert_cells` with alternating fenced code/markdown blocks.",
  );
  lines.push("");

  // 7. Run rules
  lines.push("## Running Rules");
  lines.push("");
  lines.push(
    "- To run a cell, use `run_cell`. It executes immediately and returns the output.",
  );
  lines.push(
    "- After inserting code cells, run them in order so the user sees the results. You can include multiple `run_cell` blocks in the same response.",
  );
  lines.push(
    "- After insert_cells, subsequent tool calls in the same response will see updated cell indices.",
  );
  lines.push("");

  // 8. General guidance
  lines.push("## Important");
  lines.push("");
  lines.push("- You can include multiple tool blocks in a single response.");
  lines.push(
    "- After tool results are returned, you will have a chance to continue.",
  );
  lines.push("- Always inspect cells before modifying them.");
  lines.push("- Keep explanations concise.");

  return lines.join("\n");
}
