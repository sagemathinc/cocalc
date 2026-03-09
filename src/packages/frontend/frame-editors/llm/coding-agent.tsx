/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
An interactive coding agent frame panel with collaborative sessions.

State is stored in a SyncDB so all collaborators see the same conversation.
When embedded in the side chat, it piggybacks on the existing chat syncdb
(records with event="coding-agent").  When used as a standalone frame, it
creates its own hidden meta file.

Sessions let users start fresh conversations.
The agent can suggest search/replace edits and execute shell commands
(with user confirmation).
*/

import {
  Alert,
  Button,
  Dropdown,
  Input,
  Modal,
  Popconfirm,
  Spin,
  Tooltip,
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import type { CSS } from "@cocalc/frontend/app-framework";
import { LLMCostEstimationChat } from "@cocalc/frontend/chat/llm-cost-estimation";
import type { CostEstimate } from "@cocalc/frontend/chat/types";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { EditorComponentProps } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { calcMinMaxEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { getOneFreeModel, isFreeModel } from "@cocalc/util/db-schema/llm-utils";
import { three_way_merge } from "@cocalc/util/dmp";
import {
  filename_extension,
  hidden_meta_file,
  path_split,
  uuid,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import LLMSelector from "./llm-selector";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DisplayMessage {
  sender: "user" | "assistant" | "system";
  content: string;
  date: string;
  event: string;
  account_id?: string;
  base_snapshot?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TAG = "coding-agent";
const SYNCDB_CHANGE_THROTTLE = 300;

// The event value used in the chat syncdb to identify coding-agent records.
const CODING_AGENT_EVENT = "coding-agent";

function agentSyncdbPath(path: string): string {
  return hidden_meta_file(path, "coding-agent");
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const CONTAINER_STYLE: CSS = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
} as const;

const MESSAGES_STYLE: CSS = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 12px",
} as const;

const USER_MSG_STYLE: CSS = {
  background: COLORS.GRAY_LLL,
  borderRadius: 8,
  padding: "8px 12px",
  marginBottom: 8,
  whiteSpace: "pre-wrap",
} as const;

const ASSISTANT_MSG_STYLE: CSS = {
  marginBottom: 8,
  padding: "8px 12px",
} as const;

const DIFF_MAX_HEIGHT = 200;

/**
 * Wraps rendered markdown so that `pre` blocks (diffs, code) are
 * compact by default and expandable on click.
 */
function CollapsibleDiffs({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // After mount, attach overflow detection + click handlers to <pre> elements.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const pres = el.querySelectorAll("pre");
    pres.forEach((pre) => {
      // Apply compact styling — scrollable within the max-height
      pre.style.fontSize = "0.82em";
      pre.style.maxHeight = `${DIFF_MAX_HEIGHT}px`;
      pre.style.overflow = "auto";
      pre.style.position = "relative";
    });
  });

  return <div ref={containerRef}>{children}</div>;
}

/**
 * Small isolated component for the rename modal so typing doesn't
 * re-render the entire CodingAgentCore tree.
 */
function RenameModal({
  open,
  currentName,
  onSave,
  onCancel,
}: {
  open: boolean;
  currentName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<any>(null);

  // Reset value and focus when the modal opens.
  useEffect(() => {
    if (open) {
      setValue(currentName);
      // Focus + select after antd animation completes
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open, currentName]);

  const handleOk = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSave(trimmed);
    }
  };

  return (
    <Modal
      title="Rename Turn"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="Save"
      destroyOnClose
    >
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={handleOk}
        placeholder="Enter a name for this turn..."
        maxLength={80}
      />
    </Modal>
  );
}

const SYSTEM_MSG_STYLE: CSS = {
  marginBottom: 8,
  padding: "8px 12px",
  background: COLORS.BS_GREEN_LL,
  borderRadius: 8,
  fontSize: "0.9em",
} as const;

const INPUT_AREA_STYLE: CSS = {
  borderTop: `1px solid ${COLORS.GRAY_L}`,
  padding: "8px 12px",
} as const;

/* ------------------------------------------------------------------ */
/*  Editor context helpers                                             */
/* ------------------------------------------------------------------ */

function getEditorContent(actions: any): string {
  const cm = actions._get_cm?.(undefined, true);
  if (cm != null) {
    return cm.getValue();
  }
  return actions._syncstring?.to_str?.() ?? "";
}

function getEditorContext(actions: any): {
  content: string;
  visibleRange?: { firstLine: number; lastLine: number };
  cursorLine?: number;
  selection?: string;
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

  return {
    content,
    visibleRange: { firstLine, lastLine },
    cursorLine: cursor.line,
    selection: selection || undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Search/replace block parsing & application                         */
/* ------------------------------------------------------------------ */

interface SearchReplace {
  search: string;
  replace: string;
}

/**
 * Parse search/replace blocks from the LLM response.
 * Format:
 * <<<SEARCH
 * old code
 * >>>REPLACE
 * new code
 * <<<END
 */
function parseSearchReplaceBlocks(text: string): SearchReplace[] {
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
function applySearchReplace(
  base: string,
  blocks: SearchReplace[],
): { result: string; applied: number; failed: number } {
  let result = base;
  let applied = 0;
  let failed = 0;
  for (const { search, replace } of blocks) {
    const idx = result.indexOf(search);
    if (idx === -1) {
      // Try trimmed match as fallback (LLM sometimes adds/removes whitespace)
      const trimmedSearch = search.trim();
      const lines = result.split("\n");
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === trimmedSearch) {
          // Found a line that matches when trimmed — use it
          const lineStart =
            lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
          const lineEnd = lineStart + lines[i].length;
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
function formatSearchReplaceAsDiff(text: string): string {
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
 */
function extractCodeBlock(text: string): string | undefined {
  const match = text.match(/```[\w]*\n([\s\S]*?)```/);
  return match?.[1];
}

/* ------------------------------------------------------------------ */
/*  Line-number-based edit blocks                                      */
/* ------------------------------------------------------------------ */

interface EditBlock {
  startLine: number; // 1-based inclusive
  endLine: number; // 1-based inclusive
  replacement: string;
}

/**
 * Parse line-number-based edit blocks from the LLM response.
 * Format:
 *   <<<EDIT lines 5-8
 *   replacement text
 *   <<<END
 *
 * Single-line form:
 *   <<<EDIT line 5
 *   replacement text
 *   <<<END
 */
function parseEditBlocks(text: string): EditBlock[] {
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
function applyEditBlocks(
  base: string,
  blocks: EditBlock[],
): { result: string; applied: number; failed: number } {
  const lines = base.split("\n");
  let applied = 0;
  let failed = 0;

  // Process from bottom to top so earlier indices stay stable.
  const sorted = [...blocks].sort((a, b) => b.startLine - a.startLine);

  for (const block of sorted) {
    // Validate line range (1-based)
    if (
      block.startLine < 1 ||
      block.endLine < block.startLine ||
      block.startLine > lines.length
    ) {
      failed++;
      continue;
    }
    // Clamp endLine to document length
    const endLine = Math.min(block.endLine, lines.length);
    const replacementLines =
      block.replacement === "" ? [] : block.replacement.split("\n");
    // splice: remove from startLine-1 to endLine (inclusive), insert replacement
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
 * Uses the base snapshot to show the original lines being replaced.
 */
function formatEditBlocksAsDiff(text: string, base: string): string {
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
/*  System prompt builder                                              */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(
  path: string,
  ctx: ReturnType<typeof getEditorContext>,
  hasBuild: boolean,
): string {
  const ext = filename_extension(path).toLowerCase();
  const lines: string[] = [
    `You are a coding assistant embedded in a CoCalc editor.`,
    `The user is editing "${path}".`,
  ];

  // File-type specific hints
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
      `Editor viewport: lines ${ctx.visibleRange.firstLine + 1}–${ctx.visibleRange.lastLine + 1}.`,
    );
  }
  if (ctx.cursorLine != null) {
    lines.push(`Cursor: line ${ctx.cursorLine + 1}.`);
  }
  if (ctx.selection) {
    lines.push(`Selected text:\n\`\`\`\n${ctx.selection}\n\`\`\``);
  }

  // Send the document with numbered lines so the LLM can reference them.
  const contentLines = ctx.content.split("\n");
  const numbered = contentLines
    .map((line, i) => `${String(i + 1).padStart(4)}  ${line}`)
    .join("\n");

  lines.push("");
  lines.push("Full document content (with line numbers):");
  lines.push("```");
  lines.push(numbered);
  lines.push("```");

  lines.push("");
  lines.push(`When you want to edit the file, use line-based edit blocks. Reference the line numbers shown above.

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
- The replacement text must NOT include line numbers — only the actual code.
- You can include multiple edit blocks in one response. They are applied from bottom to top, so line numbers remain stable.
- Keep edits minimal — only include the lines that actually need to change.
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
/*  Parse exec blocks from LLM response                               */
/* ------------------------------------------------------------------ */

interface ExecBlock {
  command: string;
}

function parseExecBlocks(text: string): ExecBlock[] {
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
/*  SyncDB helpers for the two schemas                                 */
/* ------------------------------------------------------------------ */

/**
 * Sender ID used in the chat syncdb for non-user messages.
 * We need a unique sender_id because (date, sender_id, event) is the
 * primary key in the chat syncdb.
 */
function agentSenderId(sender: "assistant" | "system"): string {
  return `coding-agent-${sender}`;
}

/* ------------------------------------------------------------------ */
/*  Main component — standalone frame wrapper                          */
/* ------------------------------------------------------------------ */

export default function CodingAgent(_props: EditorComponentProps) {
  return <CodingAgentCore />;
}

/**
 * Embedded version for use inside the side chat frame.
 * Receives the chat syncdb so we don't create a separate file.
 * IMPORTANT: chatSyncdb must be a valid, ready SyncDB — the parent
 * component must wait for it before rendering this component.
 */
export function CodingAgentEmbedded({ chatSyncdb }: { chatSyncdb: any }) {
  if (chatSyncdb == null) {
    console.warn("CodingAgentEmbedded: chatSyncdb is null — not rendering");
    return null;
  }
  return <CodingAgentCore chatSyncdb={chatSyncdb} />;
}

/* ------------------------------------------------------------------ */
/*  Core component                                                     */
/* ------------------------------------------------------------------ */

function CodingAgentCore({ chatSyncdb }: { chatSyncdb?: any } = {}) {
  const { project_id, path, actions } = useFrameContext();
  const [model, setModel] = useLanguageModelSetting(project_id);
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
  const llm_markup = useTypedRedux("customize", "llm_markup");
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>("");
  const [costEstimate, setCostEstimate] = useState<CostEstimate>(null);
  const [pendingEdits, setPendingEdits] = useState<
    | { type: "edit_blocks"; blocks: EditBlock[]; base: string }
    | { type: "search_replace"; blocks: SearchReplace[]; base: string }
    | { type: "full_replace"; code: string; base: string }
    | undefined
  >();
  const [pendingExec, setPendingExec] = useState<ExecBlock[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  // Ref to always call the latest loadSessionsAndMessages from change handlers,
  // avoiding stale closures in the useEffect event listeners.
  const loadRef = useRef<(db: any) => void>(() => {});

  // Whether we're using the chat syncdb schema (embedded mode) or our own.
  const usesChatSchema = chatSyncdb != null;

  // SyncDB state
  const [syncdb, setSyncdb] = useState<any>(chatSyncdb ?? null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessionId, setSessionIdState] = useState<string>("");
  // Keep a ref in sync with sessionId so that loadSessionsAndMessages
  // (called from SyncDB event handlers) always reads the latest value
  // without needing to be recreated — avoids stale closure bugs.
  const sessionIdRef = useRef<string>("");
  const setSessionId = useCallback((id: string) => {
    sessionIdRef.current = id;
    setSessionIdState(id);
  }, []);
  const [allSessions, setAllSessions] = useState<string[]>([]);
  // Map of session_id → human-readable name (stored in SyncDB as special records)
  const [sessionNames, setSessionNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  // LLM cost estimation — recompute when input or model changes
  const estimateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      // Debounce cost estimation (500ms)
      if (estimateTimeoutRef.current) {
        clearTimeout(estimateTimeoutRef.current);
      }
      estimateTimeoutRef.current = setTimeout(async () => {
        if (!value.trim() || !model) {
          setCostEstimate(null);
          return;
        }
        if (isFreeModel(model, isCoCalcCom)) {
          setCostEstimate({ min: 0, max: 0 });
          return;
        }
        const { numTokensEstimate } = await import("@cocalc/frontend/misc/llm");
        // Estimate tokens for system prompt + history + input
        const currentMessages = messages.filter((m) => m.event === "message");
        const historyText = currentMessages.map((m) => m.content).join("\n");
        const tokens = numTokensEstimate([historyText, value].join("\n"));
        const est = calcMinMaxEstimation(tokens, model, llm_markup);
        setCostEstimate(est);
      }, 500);
    },
    [model, isCoCalcCom, llm_markup, messages],
  );

  // Initialize own syncdb (standalone mode only)
  useEffect(() => {
    if (usesChatSchema) {
      // In embedded mode, the syncdb is provided by the parent.
      return;
    }

    const syncdbPath = agentSyncdbPath(path);

    // Ensure the file isn't marked as deleted
    redux.getProjectActions(project_id)?.setNotDeleted(syncdbPath);

    const db = webapp_client.sync_client.sync_db({
      project_id,
      path: syncdbPath,
      primary_keys: ["session_id", "date"],
      string_cols: ["content"],
      change_throttle: SYNCDB_CHANGE_THROTTLE,
    });

    const handleReady = () => {
      setSyncdb(db);
      loadRef.current(db);
    };

    const handleChange = () => {
      if (db.get_state() === "ready") {
        loadRef.current(db);
      }
    };

    // Register listener first — catches changes that arrive during init.
    db.on("change", handleChange);

    if (db.get_state() === "ready") {
      handleReady();
    } else {
      db.once("ready", handleReady);
    }

    db.once("error", (err: any) => {
      console.warn(`CodingAgent syncdb error: ${err}`);
      setError(`SyncDB error: ${err}`);
    });

    return () => {
      db.removeListener("change", handleChange);
    };
  }, [project_id, path]);

  // When using the chat syncdb (embedded mode), listen for changes.
  // Following the pattern from chat/register.ts: register the change
  // listener BEFORE checking ready, so we never miss the initial emit.
  useEffect(() => {
    if (!usesChatSchema || !chatSyncdb) return;

    const handleChange = () => {
      if (chatSyncdb.get_state() === "ready") {
        loadRef.current(chatSyncdb);
      }
    };

    // Register listener first — catches changes that arrive during init.
    chatSyncdb.on("change", handleChange);

    if (chatSyncdb.get_state() === "ready") {
      setSyncdb(chatSyncdb);
      loadRef.current(chatSyncdb);
    } else {
      chatSyncdb.once("ready", () => {
        setSyncdb(chatSyncdb);
        loadRef.current(chatSyncdb);
      });
    }

    return () => {
      chatSyncdb.removeListener("change", handleChange);
    };
  }, [chatSyncdb]);

  /**
   * Read all sessions from syncdb and load messages for the active session.
   * Reads sessionId from sessionIdRef (not closure) to avoid stale data
   * when called from SyncDB event handlers between React renders.
   */
  const loadSessionsAndMessages = useCallback(
    (db: any) => {
      if (db?.get_state() !== "ready") return;

      const allRecords = db.get();
      if (allRecords == null) return;

      const currentSessionId = sessionIdRef.current;
      const sessionsSet = new Set<string>();
      const msgsBySession = new Map<string, DisplayMessage[]>();
      const names = new Map<string, string>();

      allRecords.forEach((record: any) => {
        // In chat schema mode, only look at coding-agent records.
        if (usesChatSchema) {
          if (record.get("event") !== CODING_AGENT_EVENT) return;
        }

        const sid = record.get("session_id");
        if (!sid) return;
        sessionsSet.add(sid);

        // Extract session names from special "session_name" records.
        const eventField = usesChatSchema
          ? record.get("msg_event")
          : record.get("event");
        if (eventField === "session_name") {
          const name = record.get("content");
          if (name) names.set(sid, name);
          return; // don't add to messages
        }

        if (!msgsBySession.has(sid)) {
          msgsBySession.set(sid, []);
        }

        if (usesChatSchema) {
          // Chat syncdb schema: fields stored as extra JSON fields.
          msgsBySession.get(sid)!.push({
            sender: record.get("sender") ?? "user",
            content: record.get("content") ?? "",
            date: record.get("date") ?? "",
            event: record.get("msg_event") ?? "message",
            account_id: record.get("account_id"),
            base_snapshot: record.get("base_snapshot"),
          });
        } else {
          // Standalone syncdb schema.
          msgsBySession.get(sid)!.push({
            sender: record.get("sender") ?? "user",
            content: record.get("content") ?? "",
            date: record.get("date") ?? "",
            event: record.get("event") ?? "message",
            account_id: record.get("account_id"),
            base_snapshot: record.get("base_snapshot"),
          });
        }
      });
      setSessionNames(names);

      // If we have a pending new session (just created, no messages yet),
      // include it in the list so the UI doesn't discard it.
      const pendingId = pendingNewSessionRef.current;
      if (pendingId && sessionsSet.has(pendingId)) {
        // Session now has records — clear the pending ref.
        pendingNewSessionRef.current = "";
      }
      if (pendingId && !sessionsSet.has(pendingId)) {
        sessionsSet.add(pendingId);
      }

      // Sort sessions chronologically by earliest message date.
      // Sessions with no messages yet (pending) sort last.
      const sessions = Array.from(sessionsSet).sort((a, b) => {
        const aDate = msgsBySession.get(a)?.[0]?.date ?? "\uffff";
        const bDate = msgsBySession.get(b)?.[0]?.date ?? "\uffff";
        return aDate.localeCompare(bDate);
      });
      setAllSessions(sessions);

      // If no session exists or the current session is gone, pick the latest
      const activeSession =
        currentSessionId && sessionsSet.has(currentSessionId)
          ? currentSessionId
          : sessions.length > 0
            ? sessions[sessions.length - 1]
            : "";

      if (activeSession !== currentSessionId) {
        setSessionId(activeSession);
      }

      if (activeSession) {
        const msgs = msgsBySession.get(activeSession) ?? [];
        msgs.sort(
          (a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf(),
        );
        setMessages(msgs);
      } else {
        setMessages([]);
      }
    },
    [usesChatSchema],
  );
  // Keep the ref in sync so change handlers always call the latest version.
  loadRef.current = loadSessionsAndMessages;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reload when sessionId changes
  useEffect(() => {
    if (syncdb?.get_state() === "ready") {
      loadSessionsAndMessages(syncdb);
    }
  }, [sessionId, syncdb]);

  // Ref to hold a newly created session ID that has no records yet,
  // so loadSessionsAndMessages doesn't discard it.
  const pendingNewSessionRef = useRef<string>("");

  const handleNewSession = useCallback(() => {
    const newId = uuid();
    pendingNewSessionRef.current = newId;
    setSessionId(newId);
    setMessages([]);
    setPendingEdits(undefined);
    setPendingExec([]);
    setError("");
  }, []);

  const handleClearSession = useCallback(() => {
    if (!syncdb || !sessionId) return;
    const allRecords = syncdb.get();
    if (allRecords != null) {
      allRecords.forEach((record: any) => {
        if (usesChatSchema) {
          if (
            record.get("event") === CODING_AGENT_EVENT &&
            record.get("session_id") === sessionId
          ) {
            syncdb.delete({
              date: record.get("date"),
              sender_id: record.get("sender_id"),
              event: CODING_AGENT_EVENT,
            });
          }
        } else {
          if (record.get("session_id") === sessionId) {
            syncdb.delete({
              session_id: sessionId,
              date: record.get("date"),
            });
          }
        }
      });
      syncdb.commit();
    }
    setMessages([]);
    setPendingEdits(undefined);
    setPendingExec([]);
  }, [syncdb, sessionId, usesChatSchema]);

  /** Write a single message to the syncdb. */
  const writeMessage = useCallback(
    (msg: {
      date: string;
      sender: "user" | "assistant" | "system";
      content: string;
      account_id?: string;
      msg_event: string;
      base_snapshot?: string;
      session_id?: string;
    }) => {
      if (!syncdb || syncdb.get_state() !== "ready") return;
      const sid = msg.session_id || sessionId || uuid();

      if (usesChatSchema) {
        syncdb.set({
          date: msg.date,
          sender_id:
            msg.sender === "user"
              ? (msg.account_id ?? "unknown")
              : agentSenderId(msg.sender),
          event: CODING_AGENT_EVENT,
          session_id: sid,
          content: msg.content,
          sender: msg.sender,
          msg_event: msg.msg_event,
          account_id: msg.account_id,
          base_snapshot: msg.base_snapshot,
        });
      } else {
        syncdb.set({
          session_id: sid,
          date: msg.date,
          sender: msg.sender,
          content: msg.content,
          account_id: msg.account_id,
          event: msg.msg_event,
          base_snapshot: msg.base_snapshot,
        });
      }
      syncdb.commit();
    },
    [syncdb, sessionId, usesChatSchema],
  );

  /** Write (or overwrite) the human-readable name for a session. */
  const writeSessionName = useCallback(
    (name: string, sid?: string) => {
      if (!syncdb || syncdb.get_state() !== "ready") return;
      const targetSid = sid || sessionId;
      if (!targetSid) return;
      // In chat schema, primary key is [date, sender_id, event].
      // Embed session_id in the date to make each name record unique.
      const date = `session_name:${targetSid}`;
      if (usesChatSchema) {
        syncdb.set({
          date,
          sender_id: agentSenderId("system"),
          event: CODING_AGENT_EVENT,
          session_id: targetSid,
          content: name,
          sender: "system",
          msg_event: "session_name",
        });
      } else {
        syncdb.set({
          session_id: targetSid,
          date,
          sender: "system",
          content: name,
          event: "session_name",
        });
      }
      syncdb.commit();
      // Update local state immediately for responsiveness.
      setSessionNames((prev) => new Map(prev).set(targetSid, name));
    },
    [syncdb, sessionId, usesChatSchema],
  );

  /**
   * Auto-generate a short name for a session after the first Q&A pair.
   * Uses a free model on cocalc.com; the user's selected model otherwise.
   */
  const autoNameSession = useCallback(
    async (userPrompt: string, assistantReply: string, sid: string) => {
      // Don't overwrite an existing name
      if (sessionNames.has(sid)) return;
      try {
        const nameModel = isCoCalcCom ? getOneFreeModel() : model;
        const stream = webapp_client.openai_client.queryStream({
          input: `Given this conversation between a user and a coding assistant, generate a very short descriptive title (at most 7 words). Reply with ONLY the title, no quotes, no punctuation at the end.\n\nUser: ${userPrompt.slice(0, 500)}\n\nAssistant: ${assistantReply.slice(0, 500)}`,
          system:
            "You generate short descriptive titles for conversations. Reply with only the title.",
          history: [],
          model: nameModel,
          project_id,
          tag: "coding-agent:auto-name",
        });
        let title = "";
        stream.on("token", (token: string | null) => {
          if (token != null) {
            title += token;
          } else {
            // Stream ended — save the name
            const trimmed = title.trim().slice(0, 80);
            if (trimmed) {
              writeSessionName(trimmed, sid);
            }
          }
        });
        stream.on("error", () => {
          // Silently ignore — auto-naming is best-effort
        });
      } catch {
        // Silently ignore
      }
    },
    [isCoCalcCom, model, project_id, sessionNames, writeSessionName],
  );

  const handleSubmit = useCallback(
    async (directInput?: string) => {
      const prompt = (directInput ?? input).trim();
      if (!prompt || generating) return;

      setError("");
      setPendingEdits(undefined);
      setPendingExec([]);
      cancelRef.current = false;

      // Ensure we have a session
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        activeSessionId = uuid();
        setSessionId(activeSessionId);
      }

      // Snapshot the document now (for merging later)
      const ctx = getEditorContext(actions);
      const baseSnapshot = ctx.content;

      const now = new Date().toISOString();
      const accountId =
        redux.getStore("account")?.get_account_id?.() ?? "unknown";

      // Write user message to syncdb
      writeMessage({
        date: now,
        sender: "user",
        content: prompt,
        account_id: accountId,
        msg_event: "message",
        base_snapshot: baseSnapshot,
        session_id: activeSessionId,
      });

      setInput("");
      setGenerating(true);

      try {
        const hasBuild = typeof actions.build === "function";
        const system = buildSystemPrompt(path, ctx, hasBuild);

        // Build conversation history from current session messages
        const currentMessages = messages.filter((m) => m.event === "message");
        const history = currentMessages.map((m) => ({
          role: m.sender as "user" | "assistant",
          content: m.content,
        }));

        const llmStream = webapp_client.openai_client.queryStream({
          input: prompt,
          system,
          history,
          model,
          project_id,
          tag: TAG,
        });

        let assistantContent = "";
        // We use a local temp message array to show streaming in real time
        const streamingMsgs = [
          ...messages,
          {
            sender: "user" as const,
            content: prompt,
            date: now,
            event: "message",
            account_id: accountId,
          },
        ];

        llmStream.on("token", (token: string | null) => {
          if (cancelRef.current) return;
          if (token != null) {
            assistantContent += token;
            setMessages([
              ...streamingMsgs,
              {
                sender: "assistant",
                content: assistantContent,
                date: "",
                event: "message",
              },
            ]);
          } else {
            // Stream ended
            setGenerating(false);

            // Write assistant message to syncdb
            const assistantDate = new Date().toISOString();
            writeMessage({
              date: assistantDate,
              sender: "assistant",
              content: assistantContent,
              msg_event: "message",
              session_id: activeSessionId,
            });

            // Check for line-number edit blocks first (preferred format)
            const editBlocks = parseEditBlocks(assistantContent);
            if (editBlocks.length > 0) {
              setPendingEdits({
                type: "edit_blocks",
                blocks: editBlocks,
                base: baseSnapshot,
              });
            } else {
              // Fallback: legacy search/replace blocks
              const srBlocks = parseSearchReplaceBlocks(assistantContent);
              if (srBlocks.length > 0) {
                setPendingEdits({
                  type: "search_replace",
                  blocks: srBlocks,
                  base: baseSnapshot,
                });
              } else {
                // Fallback: check for a plain code block
                const code = extractCodeBlock(assistantContent);
                if (code) {
                  setPendingEdits({
                    type: "full_replace",
                    code,
                    base: baseSnapshot,
                  });
                }
              }
            }

            // Check for exec blocks
            const execBlocks = parseExecBlocks(assistantContent);
            if (execBlocks.length > 0) {
              setPendingExec(execBlocks);
            }

            // Auto-name the session after the first Q&A exchange.
            if (history.length === 0) {
              autoNameSession(prompt, assistantContent, activeSessionId);
            }
          }
        });

        llmStream.on("error", (err: Error) => {
          setError(err.message ?? `${err}`);
          setGenerating(false);
        });
      } catch (err: any) {
        setError(err.message ?? `${err}`);
        setGenerating(false);
      }
    },
    [
      input,
      messages,
      generating,
      actions,
      path,
      model,
      project_id,
      sessionId,
      syncdb,
      writeMessage,
    ],
  );

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setGenerating(false);
  }, []);

  const handleApplyEdits = useCallback(() => {
    if (!pendingEdits) return;

    const currentContent = getEditorContent(actions);

    let newContent: string;
    if (pendingEdits.type === "edit_blocks") {
      // Apply line-number-based edits to the base snapshot
      const {
        result: modified,
        applied,
        failed,
      } = applyEditBlocks(pendingEdits.base, pendingEdits.blocks);

      if (applied === 0) {
        setError(
          `Could not apply edits: none of the ${failed} edit block(s) had valid line ranges.`,
        );
        setPendingEdits(undefined);
        return;
      }

      if (failed > 0) {
        setError(
          `Applied ${applied} edit(s), but ${failed} had invalid line ranges.`,
        );
      }

      // Three-way merge: base is the snapshot, local is current doc, remote is modified
      newContent = three_way_merge({
        base: pendingEdits.base,
        local: currentContent,
        remote: modified,
      });
    } else if (pendingEdits.type === "search_replace") {
      // Legacy: apply search/replace to the clean base snapshot
      const {
        result: modified,
        applied,
        failed,
      } = applySearchReplace(pendingEdits.base, pendingEdits.blocks);

      if (applied === 0) {
        setError(
          `Could not apply edits: none of the ${failed} search block(s) matched the document.`,
        );
        setPendingEdits(undefined);
        return;
      }

      if (failed > 0) {
        setError(
          `Applied ${applied} edit(s), but ${failed} search block(s) did not match.`,
        );
      }

      newContent = three_way_merge({
        base: pendingEdits.base,
        local: currentContent,
        remote: modified,
      });
    } else {
      // Full replacement with three-way merge
      newContent = three_way_merge({
        base: pendingEdits.base,
        local: currentContent,
        remote: pendingEdits.code,
      });
    }

    // Apply via the public set_value API — this updates both the
    // CodeMirror editor and the syncstring, handles undo mode, and
    // emits the "change" event so derived classes (e.g. LaTeX preview)
    // react properly.
    try {
      actions.set_value(newContent);
    } catch (err) {
      setError(`Failed to apply edits: ${err}`);
    }
    setPendingEdits(undefined);
  }, [pendingEdits, actions]);

  const handleExecCommand = useCallback(
    async (command: string) => {
      const dir = path_split(path).head || ".";
      try {
        const result = await exec(
          {
            project_id,
            command: "/bin/bash",
            args: ["-c", command],
            timeout: 60,
            max_output: 100000,
            bash: false,
            path: dir,
            err_on_exit: false,
          },
          path,
        );

        const output = [
          result.stdout ? `**stdout:**\n\`\`\`\n${result.stdout}\n\`\`\`` : "",
          result.stderr ? `**stderr:**\n\`\`\`\n${result.stderr}\n\`\`\`` : "",
          result.exit_code != null ? `Exit code: ${result.exit_code}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const now = new Date().toISOString();
        writeMessage({
          date: now,
          sender: "system",
          content: `Executed: \`${command}\`\n\n${output}`,
          msg_event: "exec_result",
        });
      } catch (err: any) {
        const now = new Date().toISOString();
        writeMessage({
          date: now,
          sender: "system",
          content: `Error executing \`${command}\`: ${err.message ?? err}`,
          msg_event: "exec_result",
        });
      }
      // Remove the executed command from pending
      setPendingExec((prev) => prev.filter((e) => e.command !== command));
    },
    [project_id, path, writeMessage],
  );

  const handleBuild = useCallback(() => {
    actions.build?.();
  }, [actions]);

  // "Done" closes the current turn and starts a new one.
  const handleDone = useCallback(() => {
    handleNewSession();
  }, [handleNewSession]);

  // Whether the current turn has at least one assistant response.
  const hasAssistantResponse = messages.some(
    (m) => m.sender === "assistant" && m.event === "message",
  );

  const hasBuild = typeof actions.build === "function";

  // Turns dropdown menu items (most recent first)
  const turnsMenuItems = useMemo(() => {
    return allSessions
      .map((sid, i) => {
        const name = sessionNames.get(sid);
        const label = name ? `${name}` : `Turn ${i + 1}`;
        return {
          key: sid,
          label: `${label}${sid === sessionId ? "  •" : ""}`,
        };
      })
      .reverse();
  }, [allSessions, sessionId, sessionNames]);

  // Label for the current session (shown in Turns button)
  const currentSessionLabel = useMemo(() => {
    if (!sessionId) return "Turns";
    const name = sessionNames.get(sessionId);
    if (name) return name;
    const idx = allSessions.indexOf(sessionId);
    return idx >= 0 ? `Turn ${idx + 1}` : "Turns";
  }, [sessionId, sessionNames, allSessions]);

  const handleRename = useCallback(() => {
    setRenameModalOpen(true);
  }, []);

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div
        style={{
          padding: "6px 12px",
          borderBottom: `1px solid ${COLORS.GRAY_L}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <AIAvatar size={20} />
        <span style={{ fontWeight: 500 }}>Coding Agent</span>
        <div style={{ flex: 1 }} />
        <LLMSelector
          model={model}
          setModel={setModel}
          project_id={project_id}
          size="small"
        />
      </div>

      {/* Session bar */}
      <div
        style={{
          padding: "4px 12px",
          borderBottom: `1px solid ${COLORS.GRAY_L}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: COLORS.GRAY_LLL,
        }}
      >
        <Dropdown
          menu={{
            items: turnsMenuItems,
            onClick: ({ key }) => {
              setSessionId(key);
            },
          }}
          trigger={["click"]}
        >
          <Button size="small">
            <Icon name="history" />{" "}
            <span
              style={{
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "inline-block",
                verticalAlign: "middle",
              }}
            >
              {currentSessionLabel}
            </span>{" "}
            ({allSessions.length})
          </Button>
        </Dropdown>
        {sessionId && (
          <Tooltip title="Rename this turn">
            <Button
              size="small"
              type="text"
              onClick={handleRename}
              icon={<Icon name="pencil" />}
            />
          </Tooltip>
        )}
        <Button size="small" onClick={handleNewSession}>
          <Icon name="plus" /> New
        </Button>
        {sessionId && messages.length > 0 && (
          <Popconfirm
            title="Clear all messages in this turn?"
            onConfirm={handleClearSession}
            okText="Clear"
            cancelText="Cancel"
          >
            <Button size="small" danger>
              <Icon name="trash" />
            </Button>
          </Popconfirm>
        )}
        <div style={{ flex: 1 }} />
        {hasBuild && (
          <Button size="small" onClick={handleBuild}>
            <Icon name="play" /> Build
          </Button>
        )}
      </div>

      {/* Messages */}
      <div style={MESSAGES_STYLE}>
        {messages.length === 0 && (
          <Paragraph
            style={{
              color: COLORS.GRAY_M,
              textAlign: "center",
              marginTop: 20,
            }}
          >
            Ask the agent to help with your document. It can see the editor
            content, suggest edits, run shell commands, and trigger builds.
          </Paragraph>
        )}
        {messages.map((msg, i) => {
          // Find the base snapshot for this assistant message
          // (the most recent user message before it has the snapshot)
          let renderedContent = msg.content;
          if (msg.sender === "assistant") {
            // Look for a base snapshot from a preceding user message
            let baseSnapshot = "";
            for (let j = i - 1; j >= 0; j--) {
              if (messages[j].sender === "user" && messages[j].base_snapshot) {
                baseSnapshot = messages[j].base_snapshot!;
                break;
              }
            }
            // Try edit blocks first (new format), then legacy search/replace
            if (parseEditBlocks(renderedContent).length > 0 && baseSnapshot) {
              renderedContent = formatEditBlocksAsDiff(
                renderedContent,
                baseSnapshot,
              );
            } else {
              renderedContent = formatSearchReplaceAsDiff(renderedContent);
            }
          }
          return (
            <div
              key={`${msg.date}-${i}`}
              style={
                msg.sender === "user"
                  ? USER_MSG_STYLE
                  : msg.sender === "system"
                    ? SYSTEM_MSG_STYLE
                    : ASSISTANT_MSG_STYLE
              }
            >
              {msg.sender === "user" ? (
                <StaticMarkdown value={msg.content} />
              ) : msg.sender === "assistant" ? (
                <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
                  <CollapsibleDiffs>
                    <StaticMarkdown value={renderedContent} />
                  </CollapsibleDiffs>
                </FileContext.Provider>
              ) : (
                <StaticMarkdown value={renderedContent} />
              )}
            </div>
          );
        })}
        {generating && (
          <div style={{ textAlign: "center", padding: 8 }}>
            <Spin size="small" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending edits action bar */}
      {pendingEdits && (
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${COLORS.GRAY_L}`,
            background: COLORS.GRAY_LLL,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Icon name="check" />
          <span>
            {pendingEdits.type === "edit_blocks"
              ? `${pendingEdits.blocks.length} edit(s) suggested.`
              : pendingEdits.type === "search_replace"
                ? `${pendingEdits.blocks.length} search/replace edit(s) suggested.`
                : "Full replacement suggested."}
          </span>
          <Button size="small" type="primary" onClick={handleApplyEdits}>
            Apply to Editor
          </Button>
          <Button size="small" onClick={() => setPendingEdits(undefined)}>
            Dismiss
          </Button>
          {hasBuild && (
            <Tooltip title="Apply changes and trigger a build">
              <Button
                size="small"
                onClick={() => {
                  handleApplyEdits();
                  setTimeout(() => handleBuild(), 500);
                }}
              >
                <Icon name="play" /> Apply & Build
              </Button>
            </Tooltip>
          )}
        </div>
      )}

      {/* Pending exec commands */}
      {pendingExec.length > 0 && (
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${COLORS.GRAY_L}`,
            background: COLORS.YELL_LLL,
          }}
        >
          <div style={{ marginBottom: 4, fontWeight: 500 }}>
            <Icon name="terminal" /> Commands to execute:
          </div>
          {pendingExec.map((cmd, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <code
                style={{
                  flex: 1,
                  fontSize: "0.85em",
                  background: COLORS.GRAY_LLL,
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {cmd.command}
              </code>
              <Popconfirm
                title={
                  <>
                    Run this command?
                    <br />
                    <code>{cmd.command}</code>
                  </>
                }
                onConfirm={() => handleExecCommand(cmd.command)}
                okText="Run"
                cancelText="Cancel"
              >
                <Button size="small" type="primary">
                  <Icon name="play" /> Run
                </Button>
              </Popconfirm>
              <Button
                size="small"
                onClick={() =>
                  setPendingExec((prev) =>
                    prev.filter((e) => e.command !== cmd.command),
                  )
                }
              >
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Error display */}
      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError("")}
          style={{ margin: "4px 12px" }}
        />
      )}

      {/* Input area — flex row with input on left, buttons on right */}
      <div style={{ ...INPUT_AREA_STYLE, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MarkdownInput
            value={input}
            onChange={handleInputChange}
            onShiftEnter={(value) => {
              handleSubmit(value);
            }}
            placeholder="Ask the coding agent..."
            height="auto"
            editBarStyle={{ overflow: "auto" }}
            style={{ minHeight: "72px", maxHeight: "200px", overflow: "auto" }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: 4,
          }}
        >
          <div style={{ flex: 1 }} />
          {costEstimate && (
            <LLMCostEstimationChat
              costEstimate={costEstimate}
              compact
              style={{
                flex: 0,
                fontSize: "85%",
                textAlign: "center",
                margin: "0 0 4px 0",
              }}
            />
          )}
          {generating ? (
            <Button onClick={handleCancel} style={{ height: "36px" }}>
              <Icon name="stop" /> Stop
            </Button>
          ) : (
            <Tooltip title="Send message (shift+enter)">
              <Button
                type="primary"
                onClick={() => handleSubmit()}
                disabled={!input.trim()}
                style={{ height: "36px" }}
                icon={<Icon name="paper-plane" />}
              >
                Send
              </Button>
            </Tooltip>
          )}
          <div style={{ height: "4px" }} />
          <Tooltip title="Close this turn and start a new one">
            <Button
              onClick={handleDone}
              disabled={!hasAssistantResponse}
              style={{ height: "36px" }}
            >
              <Icon name="check" /> Done
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Rename turn modal — separate component to isolate re-renders */}
      <RenameModal
        open={renameModalOpen}
        currentName={sessionNames.get(sessionId) ?? ""}
        onSave={(name) => {
          writeSessionName(name);
          setRenameModalOpen(false);
        }}
        onCancel={() => setRenameModalOpen(false)}
      />
    </div>
  );
}
