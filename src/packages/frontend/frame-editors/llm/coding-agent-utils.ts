/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Pure utility functions for the coding agent:
- Editor context extraction
- Search/replace and edit block parsing + application
- Show block parsing + fulfillment
- Command block parsing
- Diff formatting for display
- System prompt builder
*/

import { backtickSequence } from "@cocalc/frontend/markdown/util";
import { filename_extension } from "@cocalc/util/misc";

import type {
  EditBlock,
  ExecBlock,
  FileSearchReplace,
  SearchReplace,
  ShowBlock,
} from "./coding-agent-types";
export type { FileSearchReplace };
import { MAX_VISIBLE_LINES } from "./coding-agent-types";

export const CONTEXT_WINDOW_RADIUS_LINES = 10;
export const MAX_CONTEXT_WINDOW_CHARS = 1800;
export const MAX_SELECTION_CHARS = 500;
export const MAX_SHOW_CHARS = 1800;

/* ------------------------------------------------------------------ */
/*  Editor context helpers                                             */
/* ------------------------------------------------------------------ */

export function getEditorContent(actions: any): string {
  const cm = actions._get_cm?.(undefined, true);
  if (cm != null) {
    return cm.getValue();
  }
  return actions._syncstring?.to_str?.() ?? "";
}

export function getEditorContext(actions: any): {
  content: string;
  visibleRange?: { firstLine: number; lastLine: number };
  cursorLine?: number;
  selection?: string;
  /** 0-based line range of the current selection, if any. */
  selectionRange?: { fromLine: number; toLine: number };
} {
  const cm = actions._get_cm?.(undefined, true);
  if (cm == null) {
    const content = actions._syncstring?.to_str?.() ?? "";
    return { content };
  }

  const content = cm.getValue();
  const selection = cm.getSelection();
  const cursor = cm.getCursor();

  const scrollInfo = cm.getScrollInfo();
  const firstLine = cm.lineAtHeight(scrollInfo.top, "local");
  const lastLine = cm.lineAtHeight(
    scrollInfo.top + scrollInfo.clientHeight,
    "local",
  );

  let selectionRange: { fromLine: number; toLine: number } | undefined;
  if (selection) {
    const from = cm.getCursor("from");
    const to = cm.getCursor("to");
    selectionRange = { fromLine: from.line, toLine: to.line };
  }

  return {
    content,
    visibleRange: { firstLine, lastLine },
    cursorLine: cursor.line,
    selection: selection || undefined,
    selectionRange,
  };
}

export interface DocumentContextWindow {
  content: string;
  startLine: number; // 1-based
  endLine: number; // 1-based
  totalLines: number;
  truncated: boolean;
}

export function getDocumentContextWindow(
  content: string,
  {
    visibleRange,
    cursorLine,
    selectionRange,
    radiusLines = CONTEXT_WINDOW_RADIUS_LINES,
    maxLines = MAX_VISIBLE_LINES,
    maxChars = MAX_CONTEXT_WINDOW_CHARS,
  }: {
    visibleRange?: { firstLine: number; lastLine: number };
    cursorLine?: number;
    selectionRange?: { fromLine: number; toLine: number };
    radiusLines?: number;
    maxLines?: number;
    maxChars?: number;
  } = {},
): DocumentContextWindow {
  const lines = content.split("\n");
  const totalLines = lines.length;
  if (totalLines === 0) {
    return {
      content: "",
      startLine: 1,
      endLine: 1,
      totalLines: 0,
      truncated: false,
    };
  }

  let anchorStart: number;
  let anchorEnd: number;
  if (selectionRange) {
    anchorStart = selectionRange.fromLine;
    anchorEnd = selectionRange.toLine;
  } else if (visibleRange) {
    anchorStart = visibleRange.firstLine;
    anchorEnd = visibleRange.lastLine;
  } else if (cursorLine != null) {
    anchorStart = cursorLine;
    anchorEnd = cursorLine;
  } else {
    anchorStart = 0;
    anchorEnd = Math.min(totalLines - 1, maxLines - 1);
  }

  anchorStart = Math.max(0, Math.min(anchorStart, totalLines - 1));
  anchorEnd = Math.max(anchorStart, Math.min(anchorEnd, totalLines - 1));

  let start = Math.max(0, anchorStart - radiusLines);
  let end = Math.min(totalLines - 1, anchorEnd + radiusLines);
  if (end - start + 1 > maxLines) {
    const anchorMid = Math.floor((anchorStart + anchorEnd) / 2);
    start = Math.max(0, anchorMid - Math.floor(maxLines / 2));
    end = Math.min(totalLines - 1, start + maxLines - 1);
    if (end - start + 1 > maxLines) {
      start = Math.max(0, end - maxLines + 1);
    }
  }

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
    excerpt = excerpt.slice(0, maxChars);
    const lastNewline = excerpt.lastIndexOf("\n");
    excerpt =
      lastNewline > 0 ? excerpt.slice(0, lastNewline) : truncateMiddle(excerpt);
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
/*  Search/replace block parsing & application                         */
/* ------------------------------------------------------------------ */

/**
 * Parse search/replace blocks from the LLM response.
 * Format:
 * <<<SEARCH
 * old code
 * >>>REPLACE
 * new code
 * <<<END
 */
export function parseSearchReplaceBlocks(text: string): SearchReplace[] {
  const blocks: SearchReplace[] = [];
  const regex = /<<<SEARCH\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)<<<END/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      search: match[1].replace(/\n$/, ""),
      replace: match[2].replace(/\n$/, ""),
    });
  }
  return blocks;
}

/**
 * Parse search/replace blocks that include a file path.
 * Format:
 * <<<SEARCH path/to/file
 * old code
 * >>>REPLACE
 * new code
 * <<<END
 */
export function parseFileSearchReplaceBlocks(
  text: string,
): FileSearchReplace[] {
  const blocks: FileSearchReplace[] = [];
  const regex = /<<<SEARCH[ \t]+(.+)\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)<<<END/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      path: match[1],
      search: match[2].replace(/\n$/, ""),
      replace: match[3].replace(/\n$/, ""),
    });
  }
  return blocks;
}

/**
 * Apply search/replace blocks to a base snapshot (the clean document
 * the agent last saw).  Returns the modified text.
 */
export function applySearchReplace(
  base: string,
  blocks: SearchReplace[],
): { result: string; applied: number; failed: number } {
  let result = base;
  let applied = 0;
  let failed = 0;
  for (const { search, replace } of blocks) {
    // Reject empty/whitespace-only search blocks — matching at offset 0
    // or the first blank line would corrupt the document.
    if (!search.trim()) {
      failed++;
      continue;
    }
    const idx = result.indexOf(search);
    if (idx === -1) {
      // Try trimmed match as fallback (LLM sometimes adds/removes whitespace)
      const trimmedSearch = search.trim();
      const lines = result.split("\n");
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === trimmedSearch) {
          const lineStart =
            lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
          const lineEnd = lineStart + lines[i].length;
          // Best-effort replacement: use the replacement text as-is.
          // We don't re-indent because the replacement may already
          // include indentation, and blindly prepending the original
          // line's indent would double-indent.
          result = result.slice(0, lineStart) + replace + result.slice(lineEnd);
          applied++;
          found = true;
          break;
        }
      }
      if (!found) {
        failed++;
      }
      continue;
    }
    result = result.slice(0, idx) + replace + result.slice(idx + search.length);
    applied++;
  }
  return { result, applied, failed };
}

/**
 * Format a single search/replace pair as a ```diff fenced code block.
 * When `filePath` is provided, a **✎ path** header is prepended.
 */
export function formatDiffBlock(
  searchPart: string,
  replacePart: string,
  filePath?: string,
): string {
  const searchLines = searchPart.replace(/\n$/, "").split("\n");
  const replaceLines = replacePart.replace(/\n$/, "").split("\n");
  const diffLines = [
    ...searchLines.map((l) => `- ${l}`),
    ...replaceLines.map((l) => `+ ${l}`),
  ];
  const diffBlock = "```diff\n" + diffLines.join("\n") + "\n```";
  if (filePath) {
    return `**\u270E ${filePath}**\n${diffBlock}`;
  }
  return diffBlock;
}

/**
 * Transform <<<SEARCH/>>>REPLACE/<<<END blocks (no file path) in the
 * assistant message into ```diff fenced code blocks for proper rendering.
 */
export function formatSearchReplaceAsDiff(text: string): string {
  return text.replace(
    /<<<SEARCH\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)<<<END/g,
    (_match, searchPart: string, replacePart: string) => {
      return formatDiffBlock(searchPart, replacePart);
    },
  );
}

/**
 * Transform <<<SEARCH path/>>>REPLACE/<<<END blocks (with file path) in
 * the assistant message into ```diff fenced code blocks with a **✎ path**
 * header for proper rendering.
 */
export function formatFileSearchReplaceAsDiff(text: string): string {
  return text.replace(
    /<<<SEARCH[ \t]+(.+)\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)<<<END/g,
    (_match, filePath: string, searchPart: string, replacePart: string) => {
      return formatDiffBlock(searchPart, replacePart, filePath);
    },
  );
}

/**
 * Extract the first fenced code block (fallback when no search/replace blocks).
 * Skips ```exec blocks — those are shell commands, not file content.
 */
export function extractCodeBlock(text: string): string | undefined {
  // Backreference (\1) ensures inner fences don't terminate the block early,
  // e.g. when the LLM wraps markdown/code containing triple backticks.
  const regex = /^(`{3,})(\w*)\n([\s\S]*?)^\1[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[2] === "exec") continue;
    return match[3];
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Line-number-based edit blocks                                      */
/* ------------------------------------------------------------------ */

/**
 * Parse line-number-based edit blocks from the LLM response.
 */
export function parseEditBlocks(text: string): EditBlock[] {
  const blocks: EditBlock[] = [];
  const regex = /<<<EDIT\s+lines?\s+(\d+)(?:\s*-\s*(\d+))?\n([\s\S]*?)<<<END/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const startLine = parseInt(match[1], 10);
    const endLine = match[2] ? parseInt(match[2], 10) : startLine;
    const replacement = match[3].replace(/\n$/, "");
    blocks.push({ startLine, endLine, replacement });
  }
  return blocks;
}

/**
 * Apply line-number-based edit blocks to a document.
 * Blocks are sorted by startLine descending so earlier line numbers
 * remain valid as we splice from the bottom up.
 */
export function applyEditBlocks(
  base: string,
  blocks: EditBlock[],
): { result: string; applied: number; failed: number } {
  const lines = base.split("\n");
  let applied = 0;
  let failed = 0;

  const sorted = [...blocks].sort((a, b) => b.startLine - a.startLine);

  for (const block of sorted) {
    if (
      block.startLine < 1 ||
      block.endLine < block.startLine ||
      block.startLine > lines.length ||
      block.endLine > lines.length
    ) {
      failed++;
      continue;
    }
    const endLine = block.endLine;
    const replacementLines =
      block.replacement === "" ? [] : block.replacement.split("\n");
    lines.splice(
      block.startLine - 1,
      endLine - block.startLine + 1,
      ...replacementLines,
    );
    applied++;
  }
  return { result: lines.join("\n"), applied, failed };
}

/**
 * Transform <<<EDIT/<<<END blocks in the assistant message
 * into ```diff fenced code blocks for proper rendering.
 */
export function formatEditBlocksAsDiff(text: string, base: string): string {
  const baseLines = base.split("\n");
  return text.replace(
    /<<<EDIT\s+lines?\s+(\d+)(?:\s*-\s*(\d+))?\n([\s\S]*?)<<<END/g,
    (_match, startStr: string, endStr: string | undefined, body: string) => {
      const startLine = parseInt(startStr, 10);
      const endLine = endStr ? parseInt(endStr, 10) : startLine;
      const clampedEnd = Math.min(endLine, baseLines.length);
      const oldLines = baseLines.slice(startLine - 1, clampedEnd);
      const newLines = body.replace(/\n$/, "").split("\n");
      const diffLines = [
        `@@ lines ${startLine}-${clampedEnd} @@`,
        ...oldLines.map((l) => `- ${l}`),
        ...newLines.map((l) => `+ ${l}`),
      ];
      return "```diff\n" + diffLines.join("\n") + "\n```";
    },
  );
}

/* ------------------------------------------------------------------ */
/*  <<<SHOW block parsing & fulfillment                                */
/* ------------------------------------------------------------------ */

/** Shared regex source for matching <<<SHOW blocks. */
const SHOW_BLOCK_SOURCE = String.raw`<<<SHOW\s+lines?\s+(\d+)(?:\s*-\s*(\d+))?[\s\S]*?<<<END`;

/**
 * Regex to strip <<<SHOW blocks from rendered content (they're
 * handled automatically and shouldn't appear in the chat UI).
 */
export const SHOW_BLOCK_REGEX = new RegExp(SHOW_BLOCK_SOURCE, "g");

/**
 * Parse <<<SHOW lines N-M / <<<END blocks.  The LLM uses these to
 * request additional portions of the document it hasn't seen yet.
 */
export function parseShowBlocks(text: string): ShowBlock[] {
  const blocks: ShowBlock[] = [];
  const regex = new RegExp(SHOW_BLOCK_SOURCE, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const startLine = parseInt(match[1], 10);
    const endLine = match[2] ? parseInt(match[2], 10) : startLine;
    blocks.push({ startLine, endLine });
  }
  return blocks;
}

/**
 * Fulfill <<<SHOW requests by extracting the requested lines from the
 * document and returning them as a numbered-lines string.
 */
export function fulfillShowBlocks(
  blocks: ShowBlock[],
  content: string,
  maxLines: number = MAX_VISIBLE_LINES,
  /** Language tag for syntax-highlighted code fences (e.g. "latex"). */
  language: string = "",
  /** Filename shown in "Lines X–Y of filename" header. */
  filename: string = "",
): string | null {
  if (blocks.length === 0) return null;
  const contentLines = content.split("\n");
  const ofLabel = filename
    ? `${filename} (${contentLines.length} lines)`
    : `${contentLines.length} lines`;
  const parts: string[] = [];
  for (const block of blocks) {
    const start = Math.max(1, block.startLine);
    let end = Math.min(
      contentLines.length,
      Math.min(block.endLine, start + maxLines - 1),
    );
    // Skip if start is beyond the document — produces an empty/inverted
    // range that would confuse the LLM and waste tokens on retries.
    if (end < start) continue;
    let sliceLines = contentLines
      .slice(start - 1, end)
      .map((line, i) => `${String(start + i).padStart(4)}  ${line}`);
    while (
      sliceLines.length > 1 &&
      sliceLines.join("\n").length > MAX_SHOW_CHARS
    ) {
      sliceLines = sliceLines.slice(0, -1);
      end--;
    }
    let slice = sliceLines.join("\n");
    const truncated = end < block.endLine || slice.length > MAX_SHOW_CHARS;
    if (slice.length > MAX_SHOW_CHARS) {
      slice = truncateMiddle(
        slice,
        MAX_SHOW_CHARS,
        Math.floor(MAX_SHOW_CHARS / 3),
      );
    }
    // Use backtickSequence to guard against backticks in the content
    const open = backtickSequence(slice, language || undefined);
    const close = backtickSequence(slice);
    parts.push(
      `Lines ${start}\u2013${end} of ${ofLabel}${truncated ? " (truncated)" : ""}:\n${open}\n${slice}\n${close}`,
    );
  }
  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ */
/*  Command block parsing & result formatting                          */
/* ------------------------------------------------------------------ */

export function parseExecBlocks(text: string): ExecBlock[] {
  const blocks: ExecBlock[] = [];
  // Backreference (\1) ensures inner fences don't terminate the block early.
  const regex = /^(`{3,})exec\n([\s\S]*?)^\1[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const cmd = match[2].trim();
    // Use the match offset as a stable ID — deterministic across re-parses
    // of the same text, and unique within a single parse call.
    if (cmd) blocks.push({ id: match.index, command: cmd });
  }
  return blocks;
}

/**
 * Format the result of a shell command execution into the standard
 * markdown content used for exec_result messages in all agent variants.
 */
export function formatExecResult(
  result: { stdout?: string; stderr?: string; exit_code?: number },
  command: string,
): string {
  const output = [
    result.stdout ? `**stdout:**\n\`\`\`\n${result.stdout}\n\`\`\`` : "",
    result.stderr ? `**stderr:**\n\`\`\`\n${result.stderr}\n\`\`\`` : "",
    result.exit_code != null ? `Exit code: ${result.exit_code}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `Ran: \`${command}\`\n\n${output}`;
}

/* ------------------------------------------------------------------ */
/*  System prompt builder                                              */
/* ------------------------------------------------------------------ */

export function buildSystemPrompt(
  path: string,
  ctx: ReturnType<typeof getEditorContext>,
  _hasBuild: boolean,
): string {
  const ext = filename_extension(path).toLowerCase();
  const lines: string[] = [
    `You are a coding assistant embedded in a CoCalc editor.`,
    `The user is editing "${path}".`,
  ];

  if (ext === "tex" || ext === "rnw" || ext === "rtex") {
    lines.push("This is a LaTeX document.");
    lines.push("When editing LaTeX, preserve document structure carefully:");
    lines.push("- Keep \\begin{...} / \\end{...} pairs balanced.");
    lines.push("- Keep braces, brackets, and math delimiters balanced.");
    lines.push(
      "- Do not change only one side of a structural pair unless the matching side is also updated.",
    );
    lines.push(
      "- If a requested change touches an environment, command definition, theorem, proof, align block, or math block, include enough surrounding lines so the edited result is syntactically valid.",
    );
    lines.push(
      "- Prefer minimal edits, but never at the cost of leaving invalid LaTeX.",
    );
  } else if (ext === "md" || ext === "rmd" || ext === "qmd") {
    lines.push("This is a Markdown document.");
  } else if (ext === "py") {
    lines.push("This is a Python file.");
  } else if (ext === "r") {
    lines.push("This is an R file.");
  } else if (ext === "js" || ext === "ts" || ext === "tsx" || ext === "jsx") {
    lines.push(`This is a ${ext.toUpperCase()} file.`);
  } else if (ext) {
    lines.push(`File type: .${ext}`);
  }

  if (ctx.visibleRange) {
    lines.push(
      `Editor viewport: lines ${ctx.visibleRange.firstLine + 1}\u2013${ctx.visibleRange.lastLine + 1}.`,
    );
  }
  if (ctx.cursorLine != null) {
    lines.push(`Cursor: line ${ctx.cursorLine + 1}.`);
  }
  if (ctx.selection) {
    const truncatedSelection =
      ctx.selection.length > MAX_SELECTION_CHARS
        ? truncateMiddle(
            ctx.selection,
            MAX_SELECTION_CHARS,
            Math.floor(MAX_SELECTION_CHARS / 3),
          )
        : ctx.selection;
    const selFence = backtickSequence(truncatedSelection);
    lines.push(
      `Selected text:\n${selFence}\n${truncatedSelection}\n${selFence}`,
    );
  }

  const contextWindow = getDocumentContextWindow(ctx.content, {
    visibleRange: ctx.visibleRange,
    cursorLine: ctx.cursorLine,
    selectionRange: ctx.selectionRange,
  });
  const filename = path.split("/").pop() ?? path;

  const visibleSlice = ctx.content
    .split("\n")
    .slice(contextWindow.startLine - 1, contextWindow.endLine)
    .map(
      (line, i) =>
        `${String(contextWindow.startLine + i).padStart(4)}  ${line}`,
    )
    .join("\n");

  lines.push("");
  lines.push(
    `${contextWindow.truncated ? "Context window" : "Visible portion"} of the document (lines ${contextWindow.startLine}\u2013${contextWindow.endLine} of ${filename} (${contextWindow.totalLines} lines)):`,
  );
  // Use a dynamic fence so backticks inside the visible content (e.g.
  // fenced code blocks in .md files) don't close the wrapper early.
  const fence = backtickSequence(visibleSlice);
  lines.push(fence);
  lines.push(visibleSlice);
  lines.push(fence);

  lines.push("");
  if (contextWindow.truncated) {
    lines.push(
      `The document excerpt above was limited to a small context window around the current viewport/cursor/selection.`,
    );
    lines.push("");
  }
  lines.push(`You can see lines ${contextWindow.startLine}\u2013${contextWindow.endLine} of ${filename} (${contextWindow.totalLines} lines) above.
If you need to see other parts of the file, request them like this:

<<<SHOW lines N-M
<<<END

The user's editor will then provide those lines in the next message.
You may request up to ${MAX_VISIBLE_LINES} lines at a time.

When you want to edit the file, use line-based edit blocks. Reference the line numbers shown above.

To replace lines N through M (inclusive), use:

<<<EDIT lines N-M
replacement text here (without line numbers)
<<<END

To replace a single line N, use:

<<<EDIT line N
replacement text
<<<END

To insert new lines, replace the line at the insertion point with that line plus the new lines.

To delete lines N-M, use an empty replacement:

<<<EDIT lines N-M
<<<END

IMPORTANT:
- The replacement text must NOT include line numbers \u2014 only the actual code.
- You can include multiple edit blocks in one response. They are applied from bottom to top, so line numbers remain stable.
- Keep edits minimal \u2014 only include the lines that actually need to change.
- When making multiple edits, double-check that your line numbers match the document above.

If you need to run a shell command, output a block like:

\`\`\`exec
command here
\`\`\`

The command will run in the same directory as the file being edited.
The user will be asked to confirm before execution.

Keep responses concise and focused.`);

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Text truncation                                                    */
/* ------------------------------------------------------------------ */

const TRUNCATE_LIMIT = 1000;
const TRUNCATE_KEEP = 500;

/**
 * Middle-truncate long text for LLM history.  Keeps the first and
 * last `TRUNCATE_KEEP` characters, replacing the middle with a short
 * marker so the LLM knows content was omitted.
 */
export function truncateMiddle(
  text: string,
  limit: number = TRUNCATE_LIMIT,
  keep: number = TRUNCATE_KEEP,
): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, keep);
  const tail = text.slice(-keep);
  const omitted = text.length - 2 * keep;
  return `${head}\n\n[… ${omitted} characters omitted …]\n\n${tail}`;
}
