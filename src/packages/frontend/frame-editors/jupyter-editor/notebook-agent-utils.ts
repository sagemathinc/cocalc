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

export function truncate(
  s: string,
  maxLen: number = MAX_OUTPUT_CHARS,
): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `\n... (truncated, ${s.length} chars total)`;
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
  const regex = /```tool\n([\s\S]*?)```/g;
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
  const idx = index1 - 1;
  if (idx < 0 || idx >= cellList.length) {
    return {
      error: `Index ${index1} out of range (1..${cellList.length})`,
    };
  }
  return { idx, cellId: cellList[idx] };
}

/* ------------------------------------------------------------------ */
/*  Tool dispatcher                                                    */
/* ------------------------------------------------------------------ */

const MUTATING_TOOLS = new Set([
  "set_cell",
  "edit_cell",
  "insert_cells",
  "run_cell",
]);

/**
 * Scroll the notebook to show a specific cell by setting it as the
 * current cell in the most recent notebook frame.
 */
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
): Promise<string[]> {
  const store = jupyterActions.store;
  let cellList: string[] = store.get("cell_list")?.toJS() ?? [];
  const results: string[] = [];

  for (const tc of toolCalls) {
    // Check for cancellation between tool calls so we don't
    // run the next tool (potentially a 120s runCell) after Stop.
    if (cancelRef?.current) break;

    let affectedCellId: string | undefined;
    try {
      const result = await runSingleTool(
        tc,
        jupyterActions,
        cellList,
        language,
        cancelRef,
      );
      results.push(`**${tc.name}**: ${result}`);

      // Extract the affected cell ID directly from the tool result.
      // Each mutating tool returns JSON with an `id` field (or `cells`
      // array for insert_cells).  This is more reliable than
      // re-resolving indices, which can shift after insertions.
      if (MUTATING_TOOLS.has(tc.name)) {
        try {
          const parsed = JSON.parse(result);
          if (parsed.id) {
            affectedCellId = parsed.id;
          } else if (parsed.cells?.length > 0) {
            // insert_cells — scroll to the last inserted cell
            affectedCellId = parsed.cells[parsed.cells.length - 1].id;
          }
        } catch {
          // Non-JSON result — skip scroll
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
  const store = jupyterActions.store;

  switch (toolCall.name) {
    case "cell_count": {
      return JSON.stringify({ cell_count: cellList.length });
    }

    case "get_cell": {
      const res = resolveIndex(toolCall.args.index, cellList);
      if ("error" in res) return JSON.stringify(res);
      const cell = store.getIn(["cells", res.cellId]) as any;
      if (!cell) return JSON.stringify({ error: "Cell not found" });
      const cellType = cell.get("cell_type") ?? "code";
      const input = cell.get("input") ?? "";
      const output = getCellOutput(cell);
      return (
        `Cell #${toolCall.args.index} (${cellType}):\n` +
        fenceCell(input, cellType, language) +
        (output
          ? `\n\nOutput:\n${truncate(output)}`
          : "\n\n(no output)")
      );
    }

    case "get_cells": {
      const start = toolCall.args.start ?? 1;
      const end = toolCall.args.end ?? cellList.length;
      const parts: string[] = [];
      for (let i = start; i <= end && i <= cellList.length; i++) {
        const res = resolveIndex(i, cellList);
        if ("error" in res) continue;
        const cell = store.getIn(["cells", res.cellId]) as any;
        if (!cell) continue;
        const cellType = cell.get("cell_type") ?? "code";
        const input = cell.get("input") ?? "";
        const output = getCellOutput(cell);
        parts.push(
          `Cell #${i} (${cellType}):\n` +
            fenceCell(truncate(input, 1000), cellType, language) +
            (output
              ? `\nOutput: ${truncate(output, 1000)}`
              : ""),
        );
      }
      return parts.join("\n\n") || "(no cells in range)";
    }

    case "set_cell": {
      const res = resolveIndex(toolCall.args.index, cellList);
      if ("error" in res) return JSON.stringify(res);
      jupyterActions.set_cell_input(res.cellId, toolCall.args.content ?? "", true);
      return JSON.stringify({
        status: "updated",
        index: toolCall.args.index,
        id: res.cellId,
      });
    }

    case "edit_cell": {
      const res = resolveIndex(toolCall.args.index, cellList);
      if ("error" in res) return JSON.stringify(res);
      const cell = store.getIn(["cells", res.cellId]) as any;
      if (!cell) return JSON.stringify({ error: "Cell not found" });
      const currentInput: string = cell.get("input") ?? "";
      const blocks = parseSearchReplaceBlocks(toolCall.args.edits ?? "");
      if (blocks.length === 0) {
        return JSON.stringify({ error: "No valid search/replace blocks found" });
      }
      const { result, applied, failed } = applySearchReplace(
        currentInput,
        blocks,
      );
      if (applied > 0) {
        jupyterActions.set_cell_input(res.cellId, result, true);
      }
      return JSON.stringify({
        status: applied > 0 ? "updated" : "no_changes",
        applied,
        failed,
        index: toolCall.args.index,
        id: res.cellId,
      });
    }

    case "insert_cells": {
      const afterIndex1: number = toolCall.args.after_index ?? 0;
      const cellsMarkdown: string = toolCall.args.cells_markdown ?? "";
      const parsed = splitCells(cellsMarkdown);
      if (parsed.length === 0) {
        return JSON.stringify({ error: "No cells parsed from input" });
      }

      const inserted: { index: number; id: string; cell_type: string }[] = [];
      let prevId: string | undefined;

      if (afterIndex1 === 0) {
        // Insert at the very beginning
        prevId = undefined;
      } else {
        const res = resolveIndex(afterIndex1, cellList);
        if ("error" in res) return JSON.stringify(res);
        prevId = res.cellId;
      }

      for (const { cell_type, source } of parsed) {
        let newId: string;
        if (prevId == null) {
          newId = jupyterActions.insert_cell_at(0, true);
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
        const updatedList: string[] =
          store.get("cell_list")?.toJS() ?? [];
        const newIndex1 = updatedList.indexOf(newId) + 1;
        inserted.push({ index: newIndex1, id: newId, cell_type });
        prevId = newId;
      }

      return JSON.stringify({ status: "inserted", cells: inserted });
    }

    case "run_cell": {
      const res = resolveIndex(toolCall.args.index, cellList);
      if ("error" in res) return JSON.stringify(res);
      return await runCell(jupyterActions, res.cellId, toolCall.args.index, cancelRef);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
  }
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
  const invokedAt = Date.now();
  jupyterActions.run_cell(cellId, true);

  const store = jupyterActions.store;
  const deadline = invokedAt + CELL_RUN_TIMEOUT_MS;

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
  return JSON.stringify({
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
    lines.push(`## Current Context`);
    lines.push("");
    lines.push(
      `You are looking at Cell #${ctx.cellIndex} (${ctx.cellType ?? "code"}):`,
    );
    lines.push(fenceCell(ctx.cellContent, ctx.cellType ?? "code", ctx.language));

    if (ctx.cursorLine != null) {
      lines.push(`Cursor is at line ${ctx.cursorLine + 1}.`);
    }
    if (ctx.selection && ctx.selectionRange) {
      const { fromLine, toLine } = ctx.selectionRange;
      if (fromLine === toLine) {
        lines.push(`Selected text (line ${fromLine + 1}): "${ctx.selection}"`);
      } else {
        lines.push(
          `Selected text (lines ${fromLine + 1}\u2013${toLine + 1}):\n${ctx.selection}`,
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
    "To interact with the notebook, emit tool blocks in your response. Each tool block starts with \\`\\`\\`tool on its own line, followed by a JSON object with \"name\" and \"args\", then a closing \\`\\`\\`.",
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
  lines.push("```tool");
  lines.push('{"name": "get_cell", "args": {"index": 1}}');
  lines.push("```");
  lines.push("");

  lines.push("### get_cells");
  lines.push(
    "Get a range of cells (both start and end are inclusive).",
  );
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
    "- After insert_cells, subsequent tool calls in the same response will see updated cell indices.",
  );
  lines.push("");

  // 8. General guidance
  lines.push("## Important");
  lines.push("");
  lines.push(
    "- You can include multiple tool blocks in a single response.",
  );
  lines.push(
    "- After tool results are returned, you will have a chance to continue.",
  );
  lines.push("- Always inspect cells before modifying them.");
  lines.push("- Keep explanations concise.");

  return lines.join("\n");
}
