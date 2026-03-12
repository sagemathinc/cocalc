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
  SearchReplace,
  ShowBlock,
} from "./coding-agent-types";
import { MAX_VISIBLE_LINES } from "./coding-agent-types";

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
 * Transform <<<SEARCH/>>>REPLACE/<<<END blocks in the assistant message
 * into ```diff fenced code blocks for proper rendering.
 */
export function formatSearchReplaceAsDiff(text: string): string {
  return text.replace(
    /<<<SEARCH\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)<<<END/g,
    (_match, searchPart: string, replacePart: string) => {
      const searchLines = searchPart.replace(/\n$/, "").split("\n");
      const replaceLines = replacePart.replace(/\n$/, "").split("\n");
      const diffLines = [
        ...searchLines.map((l) => `- ${l}`),
        ...replaceLines.map((l) => `+ ${l}`),
      ];
      return "```diff\n" + diffLines.join("\n") + "\n```";
    },
  );
}

/**
 * Extract the first fenced code block (fallback when no search/replace blocks).
 * Skips ```exec blocks — those are shell commands, not file content.
 */
export function extractCodeBlock(text: string): string | undefined {
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1] === "exec") continue;
    return match[2];
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
    const end = Math.min(
      contentLines.length,
      Math.min(block.endLine, start + maxLines - 1),
    );
    // Skip if start is beyond the document — produces an empty/inverted
    // range that would confuse the LLM and waste tokens on retries.
    if (end < start) continue;
    const slice = contentLines
      .slice(start - 1, end)
      .map((line, i) => `${String(start + i).padStart(4)}  ${line}`)
      .join("\n");
    // Use backtickSequence to guard against backticks in the content
    const open = backtickSequence(slice, language || undefined);
    const close = backtickSequence(slice);
    parts.push(
      `Lines ${start}\u2013${end} of ${ofLabel}:\n${open}\n${slice}\n${close}`,
    );
  }
  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ */
/*  Command block parsing                                              */
/* ------------------------------------------------------------------ */

export function parseExecBlocks(text: string): ExecBlock[] {
  const blocks: ExecBlock[] = [];
  const regex = /```exec\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const cmd = match[1].trim();
    if (cmd) blocks.push({ command: cmd });
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/*  System prompt builder                                              */
/* ------------------------------------------------------------------ */

export function buildSystemPrompt(
  path: string,
  ctx: ReturnType<typeof getEditorContext>,
  hasBuild: boolean,
): string {
  const ext = filename_extension(path).toLowerCase();
  const lines: string[] = [
    `You are a coding assistant embedded in a CoCalc editor.`,
    `The user is editing "${path}".`,
  ];

  if (ext === "tex" || ext === "rnw" || ext === "rtex") {
    lines.push("This is a LaTeX document.");
    if (hasBuild) {
      lines.push("You can ask the user to trigger a build after changes.");
    }
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
    lines.push(`Selected text:\n\`\`\`\n${ctx.selection}\n\`\`\``);
  }

  const contentLines = ctx.content.split("\n");
  const totalLines = contentLines.length;
  const filename = path.split("/").pop() ?? path;

  let startLine: number;
  let endLine: number;
  if (ctx.visibleRange) {
    startLine = ctx.visibleRange.firstLine;
    endLine = Math.min(ctx.visibleRange.lastLine + 1, totalLines);
    if (endLine - startLine > MAX_VISIBLE_LINES) {
      const mid = Math.floor((startLine + endLine) / 2);
      startLine = Math.max(0, mid - Math.floor(MAX_VISIBLE_LINES / 2));
      endLine = Math.min(totalLines, startLine + MAX_VISIBLE_LINES);
    }
  } else {
    startLine = 0;
    endLine = Math.min(MAX_VISIBLE_LINES, totalLines);
  }

  const visibleSlice = contentLines
    .slice(startLine, endLine)
    .map((line, i) => `${String(startLine + i + 1).padStart(4)}  ${line}`)
    .join("\n");

  lines.push("");
  lines.push(
    `Visible portion of the document (lines ${startLine + 1}\u2013${endLine} of ${filename} (${totalLines} lines)):`,
  );
  lines.push("```");
  lines.push(visibleSlice);
  lines.push("```");

  lines.push("");
  lines.push(`You can see lines ${startLine + 1}\u2013${endLine} of ${filename} (${totalLines} lines) above.
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
