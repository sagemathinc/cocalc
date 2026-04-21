/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Pure helpers for the LaTeX chat-anchor feature. A chat marker is a LaTeX
comment of the form:

    % chat: <hash>

It may appear as its own line (block form) or at the end of a line with other
tex content (inline form), e.g.:

    \int_0^1 f(x) dx  % chat: abc12345

The marker's hash anchors a thread in the side-chat (see
`ChatMessage.id`). Multiple markers with the same hash are allowed and all
resolve to the same thread.
*/

import { randomId } from "@cocalc/conat/names";

/**
 * The keyword that identifies a chat-anchor LaTeX comment. Used by the
 * scanner regex AND by the insertion builders — keep them in sync via this
 * single constant.
 */
export const CHAT_PREFIX = "chat";

/**
 * Keyword for collaborative bookmarks (`% bookmark: some free text`). Same
 * LaTeX comment-parsing infrastructure as chat markers, but the value is
 * free-form text rather than a constrained hash, and no read-only lock.
 */
export const BOOKMARK_PREFIX = "bookmark";

/**
 * Match the comment body that follows an unescaped `%`. The hash alphabet
 * accepts letters, digits, dashes, and underscores so users can type
 * mnemonic ids like `review-sec2-summary`. Length 3–64 keeps it forgiving
 * while ruling out anything that looks like a sentence.
 */
const BODY_RE = new RegExp(
  `^\\s*${CHAT_PREFIX}:\\s*([A-Za-z0-9_-]{3,64})\\s*$`,
);

/** Alphabet length for generated hashes. Keep short and readable. */
const HASH_LEN = 8;

export interface ChatMarker {
  hash: string;
  /** 0-based line index. */
  line: number;
  /** 0-based column of the `%` that begins the marker comment. */
  col: number;
}

/**
 * Find the rightmost unescaped `%` on a line. Returns the column of the `%`,
 * or -1 if there isn't one.
 */
export function findCommentStart(lineText: string): number {
  let lastOk = -1;
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] !== "%") continue;
    let bs = 0;
    for (let j = i - 1; j >= 0 && lineText[j] === "\\"; j--) bs++;
    if (bs % 2 === 0) {
      lastOk = i;
    }
  }
  return lastOk;
}

/** Scan every line of `text` for markers. Preserves duplicates. */
export function scanMarkers(text: string): ChatMarker[] {
  const out: ChatMarker[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pct = findCommentStart(line);
    if (pct < 0) continue;
    const body = line.slice(pct + 1);
    const m = BODY_RE.exec(body);
    if (!m) continue;
    out.push({ hash: m[1], line: i, col: pct });
  }
  return out;
}

/** Generate a fresh marker hash. */
export function generateMarkerHash(): string {
  const r = randomId();
  if (r.length >= HASH_LEN) return r.slice(0, HASH_LEN);
  return (r + "0".repeat(HASH_LEN)).slice(0, HASH_LEN);
}

/** Build the exact text to append inline to a line of tex content. */
export function buildInlineInsertion(hash: string): string {
  return `  % ${CHAT_PREFIX}: ${hash}`;
}

/** Build the block-form insertion. Does NOT include a trailing newline. */
export function buildBlockInsertion(hash: string): string {
  return `\n% ${CHAT_PREFIX}: ${hash}\n`;
}

/** Build the standalone marker text (for replacing a blank line's content). */
export function buildMarkerLine(hash: string): string {
  return `% ${CHAT_PREFIX}: ${hash}`;
}

/** Group markers by hash, preserving insertion order within each hash. */
export function groupByHash(markers: ChatMarker[]): Map<string, ChatMarker[]> {
  const m = new Map<string, ChatMarker[]>();
  for (const mk of markers) {
    let list = m.get(mk.hash);
    if (list == null) {
      list = [];
      m.set(mk.hash, list);
    }
    list.push(mk);
  }
  return m;
}

/** Does `lineText` contain non-whitespace, non-comment tex content? */
export function lineHasTexContent(lineText: string): boolean {
  const pct = findCommentStart(lineText);
  const before = pct < 0 ? lineText : lineText.slice(0, pct);
  return before.trim().length > 0;
}

/** 0-based indices of every blank-or-whitespace-only line in `text`. */
export function scanBlankLines(text: string): number[] {
  const out: number[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") out.push(i);
  }
  return out;
}

export interface BookmarkMarker {
  /** The free-form text identifying the bookmark. */
  text: string;
  /** 0-based line index. */
  line: number;
  /** 0-based column of the `%`. */
  col: number;
}

const BOOKMARK_BODY_RE = new RegExp(
  // `\S.*?` forces the captured text to start with a non-whitespace
  // character, so lines like `% bookmark: ` (empty body, just
  // trailing whitespace) don't produce a phantom space-only bookmark.
  `^\\s*${BOOKMARK_PREFIX}:\\s*(\\S.*?)\\s*$`,
);

/** Scan every line for `% bookmark: <text>` markers. */
export function scanBookmarks(text: string): BookmarkMarker[] {
  const out: BookmarkMarker[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pct = findCommentStart(line);
    if (pct < 0) continue;
    const body = line.slice(pct + 1);
    const m = body.match(BOOKMARK_BODY_RE);
    if (!m) continue;
    out.push({ text: m[1], line: i, col: pct });
  }
  return out;
}

/** Build the standalone bookmark line, e.g. for menu insertion. */
export function buildBookmarkLine(text: string): string {
  return `% ${BOOKMARK_PREFIX}: ${text}`;
}
