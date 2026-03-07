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
  Popconfirm,
  Space,
  Spin,
  Tooltip,
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux } from "@cocalc/frontend/app-framework";
import type { CSS } from "@cocalc/frontend/app-framework";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { EditorComponentProps } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { three_way_merge } from "@cocalc/util/dmp";
import {
  filename_extension,
  hidden_meta_file,
  path_split,
  uuid,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import LLMSelector from "./llm-selector";

const { TextArea } = Input;

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
function applySearchReplace(base: string, blocks: SearchReplace[]): string {
  let result = base;
  for (const { search, replace } of blocks) {
    const idx = result.indexOf(search);
    if (idx === -1) continue; // skip if not found
    result = result.slice(0, idx) + replace + result.slice(idx + search.length);
  }
  return result;
}

/**
 * Extract the first fenced code block (fallback when no search/replace blocks).
 */
function extractCodeBlock(text: string): string | undefined {
  const match = text.match(/```[\w]*\n([\s\S]*?)```/);
  return match?.[1];
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

  lines.push("");
  lines.push("Full document content:");
  lines.push("```");
  lines.push(ctx.content);
  lines.push("```");

  lines.push("");
  lines.push(`When you want to edit the file, use search/replace blocks in this exact format:

<<<SEARCH
exact text to find
>>>REPLACE
replacement text
<<<END

You can include multiple search/replace blocks in one response.
The SEARCH text must match the document exactly (including whitespace).
Keep blocks minimal — only include the lines that need to change plus a few lines of surrounding context for unique matching.

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
 */
export function CodingAgentEmbedded({ chatSyncdb }: { chatSyncdb: any }) {
  return <CodingAgentCore chatSyncdb={chatSyncdb} />;
}

/* ------------------------------------------------------------------ */
/*  Core component                                                     */
/* ------------------------------------------------------------------ */

function CodingAgentCore({ chatSyncdb }: { chatSyncdb?: any } = {}) {
  const { project_id, path, actions } = useFrameContext();
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>("");
  const [pendingEdits, setPendingEdits] = useState<
    | { type: "search_replace"; blocks: SearchReplace[]; base: string }
    | { type: "full_replace"; code: string; base: string }
    | undefined
  >();
  const [pendingExec, setPendingExec] = useState<ExecBlock[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);

  // Whether we're using the chat syncdb schema (embedded mode) or our own.
  const usesChatSchema = chatSyncdb != null;

  // SyncDB state
  const [syncdb, setSyncdb] = useState<any>(chatSyncdb ?? null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [allSessions, setAllSessions] = useState<string[]>([]);

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
      loadSessionsAndMessages(db);
    };

    const handleChange = () => {
      if (db.get_state() === "ready") {
        loadSessionsAndMessages(db);
      }
    };

    if (db.get_state() === "ready") {
      handleReady();
    } else {
      db.once("ready", handleReady);
    }
    db.on("change", handleChange);

    db.once("error", (err: any) => {
      console.warn(`CodingAgent syncdb error: ${err}`);
      setError(`SyncDB error: ${err}`);
    });

    return () => {
      db.removeListener("change", handleChange);
    };
  }, [project_id, path]);

  // When using the chat syncdb (embedded mode), listen for changes.
  useEffect(() => {
    if (!usesChatSchema || !chatSyncdb) return;

    const handleChange = () => {
      if (chatSyncdb.get_state() === "ready") {
        loadSessionsAndMessages(chatSyncdb);
      }
    };

    if (chatSyncdb.get_state() === "ready") {
      setSyncdb(chatSyncdb);
      loadSessionsAndMessages(chatSyncdb);
    } else {
      chatSyncdb.once("ready", () => {
        setSyncdb(chatSyncdb);
        loadSessionsAndMessages(chatSyncdb);
      });
    }
    chatSyncdb.on("change", handleChange);

    return () => {
      chatSyncdb.removeListener("change", handleChange);
    };
  }, [chatSyncdb]);

  /**
   * Read all sessions from syncdb and load messages for the active session.
   */
  const loadSessionsAndMessages = useCallback(
    (db: any) => {
      if (db?.get_state() !== "ready") return;

      const allRecords = db.get();
      if (allRecords == null) return;

      const sessionsSet = new Set<string>();
      const msgsBySession = new Map<string, DisplayMessage[]>();

      allRecords.forEach((record: any) => {
        // In chat schema mode, only look at coding-agent records.
        if (usesChatSchema) {
          if (record.get("event") !== CODING_AGENT_EVENT) return;
        }

        const sid = record.get("session_id");
        if (!sid) return;
        sessionsSet.add(sid);

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

      const sessions = Array.from(sessionsSet).sort();
      setAllSessions(sessions);

      // If no session exists or the current session is gone, pick the latest
      const activeSession =
        sessionId && sessionsSet.has(sessionId)
          ? sessionId
          : sessions.length > 0
            ? sessions[sessions.length - 1]
            : "";

      if (activeSession !== sessionId) {
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
    [sessionId, usesChatSchema],
  );

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
    }) => {
      if (!syncdb || syncdb.get_state() !== "ready") return;
      const sid = sessionId || uuid();

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

  const handleSubmit = useCallback(async () => {
    const prompt = input.trim();
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
          });

          // Check for search/replace blocks
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

          // Check for exec blocks
          const execBlocks = parseExecBlocks(assistantContent);
          if (execBlocks.length > 0) {
            setPendingExec(execBlocks);
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
  }, [
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
  ]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setGenerating(false);
  }, []);

  const handleApplyEdits = useCallback(() => {
    if (!pendingEdits) return;

    const currentContent = getEditorContent(actions);

    let newContent: string;
    if (pendingEdits.type === "search_replace") {
      // Apply search/replace to the clean base snapshot
      const modified = applySearchReplace(
        pendingEdits.base,
        pendingEdits.blocks,
      );
      // Three-way merge: base is the snapshot, local is current doc, remote is modified
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

    // Apply via syncstring (goes through sync layer, propagates to all collaborators)
    const ss = actions._syncstring;
    if (ss?.from_str) {
      ss.from_str(newContent);
      ss.commit?.();
    } else {
      // Fallback: set via CodeMirror
      const cm = actions._get_cm?.(undefined, true);
      if (cm) {
        cm.setValue(newContent);
      }
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const hasBuild = typeof actions.build === "function";

  // Turns dropdown menu items (most recent first)
  const turnsMenuItems = useMemo(() => {
    const items = allSessions
      .map((sid, i) => ({
        key: sid,
        label: `Turn ${i + 1}${sid === sessionId ? "  •" : ""}`,
      }))
      .reverse();
    items.push({ key: "__new__", label: "+ New Turn" });
    return items;
  }, [allSessions, sessionId]);

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
              if (key === "__new__") {
                handleNewSession();
              } else {
                setSessionId(key);
              }
            },
          }}
          trigger={["click"]}
        >
          <Button size="small">
            <Icon name="history" /> Turns ({allSessions.length})
          </Button>
        </Dropdown>
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
        {messages.map((msg, i) => (
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
              msg.content
            ) : (
              <StaticMarkdown value={msg.content} />
            )}
          </div>
        ))}
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
            {pendingEdits.type === "search_replace"
              ? `${pendingEdits.blocks.length} edit(s) suggested.`
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

      {/* Input area */}
      <div style={INPUT_AREA_STYLE}>
        <Space.Compact style={{ width: "100%" }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the coding agent... (Shift+Enter to send)"
            autoSize={{ minRows: 1, maxRows: 6 }}
            disabled={generating}
            style={{ flex: 1 }}
          />
          {generating ? (
            <Button onClick={handleCancel}>
              <Icon name="stop" /> Stop
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              <Icon name="paper-plane" /> Send
            </Button>
          )}
        </Space.Compact>
        <div
          style={{
            marginTop: 4,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {hasBuild && (
            <Button size="small" onClick={handleBuild}>
              <Icon name="play" /> Build
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
