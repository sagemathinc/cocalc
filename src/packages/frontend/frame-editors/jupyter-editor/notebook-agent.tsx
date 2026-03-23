/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Notebook AI Agent – an LLM-powered assistant for Jupyter notebooks.

Uses the shared agent-base hook and UI components for session/SyncDB
management.  This file contains notebook-agent-specific logic:
- Context capture (focused cell, cursor, selection)
- Context indicator (yellow bar)
- Pending runs confirmation (blue bar)
- Tool-calling loop with batch dispatch
- Dual-mode editing (set_cell / edit_cell)
- Batch cell insertion (insert_cells)
- Confirm-to-run cell execution (run_cell)
*/

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux } from "@cocalc/frontend/app-framework";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { uuid } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";

import {
  AgentError,
  AgentHeader,
  AgentInputArea,
  AgentMessages,
  AgentSessionBar,
  ASSISTANT_MSG_STYLE,
  CONTAINER_STYLE,
  ERROR_MSG_STYLE,
  RenameModal,
  SYSTEM_MSG_STYLE,
  useAgentSession,
  useAutoNameSession,
} from "@cocalc/frontend/frame-editors/llm/agent-base";
import type { DisplayMessage } from "@cocalc/frontend/frame-editors/llm/agent-base";

import {
  TAG,
  MAX_TOOL_LOOPS,
  buildContextLabel,
  buildSystemPrompt,
  getNotebookContext,
  parseToolBlocks,
  runToolBatch,
} from "./notebook-agent-utils";
import type { NotebookContext } from "./notebook-agent-utils";
import type { JupyterEditorActions } from "./actions";

/* ------------------------------------------------------------------ */
/*  Tool result display                                                */
/* ------------------------------------------------------------------ */

import type { CSS } from "@cocalc/frontend/app-framework";

/** User messages: slightly darker than the shared default to stand out. */
const NB_USER_MSG_STYLE: CSS = {
  background: COLORS.GRAY_LL,
  padding: "8px 12px",
  marginBottom: 8,
  whiteSpace: "pre-wrap",
};

/** Tool result activity lines: faint and compact — clearly secondary. */
const TOOL_RESULT_STYLE: CSS = {
  marginBottom: 2,
  padding: "2px 12px",
  background: COLORS.GRAY_LLL,
  fontSize: "0.8em",
  color: COLORS.GRAY_M,
  fontFamily: "monospace",
};

/**
 * Try to find and parse a JSON object from a string, even if there's
 * a prefix like "**run_cell** (cell #3): ".
 */
function extractJson(s: string): any | undefined {
  const idx = s.indexOf("{");
  if (idx < 0) return undefined;
  try {
    return JSON.parse(s.slice(idx));
  } catch {
    return undefined;
  }
}

/**
 * Summarize a JSON tool result into a readable phrase.
 */
function summarizeJson(tool: string, data: any): string {
  switch (tool) {
    case "cell_count":
      return `${data.cell_count} cells`;
    case "get_cell":
    case "get_cells":
      return "fetched cell data";
    case "set_cell":
      return data.status === "updated"
        ? `set cell #${data.index}`
        : `set_cell: ${data.error ?? data.status}`;
    case "edit_cell":
      if (data.status === "updated")
        return `edited cell #${data.index} (${data.applied} applied)`;
      if (data.status === "no_changes")
        return `edit_cell #${data.index}: no match`;
      return `edit_cell: ${data.error ?? data.status}`;
    case "insert_cells":
      if (data.status === "inserted")
        return `inserted ${data.cells?.length ?? 0} cell(s)`;
      return `insert_cells: ${data.error ?? data.status}`;
    case "run_cell": {
      if (data.status === "completed") {
        const out = data.output?.trim();
        if (!out) return `ran cell #${data.index}`;
        const short = out.length > 60 ? out.slice(0, 60) + "..." : out;
        return `ran cell #${data.index} \u2192 ${short}`;
      }
      if (data.status === "timeout")
        return `ran cell #${data.index} (timed out)`;
      if (data.status === "pending_confirmation")
        return `cell #${data.index ?? "?"} queued`;
      return `run_cell: ${data.error ?? data.status}`;
    }
    default:
      return `${tool}: ${data.error ?? data.status ?? "done"}`;
  }
}

/**
 * Strip fenced code blocks (```...```) and replace with a short
 * inline code preview of the first meaningful line.
 */
function defenceContent(s: string): string {
  return s
    .replace(/```\w*\n([\s\S]*?)```/g, (_match, code: string) => {
      const firstLine = code.trim().split("\n")[0] ?? "";
      const preview =
        firstLine.length > 40 ? firstLine.slice(0, 40) + "..." : firstLine;
      return preview ? `\`${preview}\`` : "";
    })
    .replace(/\n{2,}/g, " ")
    .trim();
}

/**
 * Parse a single tool-result entry into a readable JSX node.
 */
function summarizeToolEntry(raw: string): React.ReactElement | string {
  // Extract tool name — handles **bold** with optional parenthetical
  const match = raw.match(
    /^\*{0,2}(\w+)\*{0,2}(?:\s*\([^)]*\))?\s*:\s*([\s\S]*)/,
  );
  if (!match) {
    const short = raw.length > 80 ? raw.slice(0, 80) + "..." : raw;
    return short;
  }

  const tool = match[1];
  const rest = match[2].trim();

  // Try JSON parse for structured summaries
  const data = extractJson(rest);
  if (data) return summarizeJson(tool, data);

  // Plain text: strip fenced code blocks → inline code previews
  const cleaned = defenceContent(rest);
  if (cleaned.length > 120) {
    const lines = rest.split("\n").length;
    return `${tool}: ${lines} lines`;
  }
  return `${tool}: ${cleaned}`;
}

/**
 * Convert raw tool-result content into readable summary elements.
 */
function formatToolResultForDisplay(content: string): React.ReactElement {
  const entries = content
    .split("\n\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const parts = entries.map(summarizeToolEntry);
  if (parts.length <= 1) {
    return <div>{parts[0] || "Done."}</div>;
  }
  return (
    <div>
      {parts.map((p, i) => (
        <div key={i}>{p}</div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NotebookAgent({
  chatSyncdb,
  fontSize,
}: {
  chatSyncdb: any;
  fontSize?: number;
}) {
  const { project_id, actions } = useFrameContext();
  const jupyterActions: JupyterActions = (actions as any).jupyter_actions;
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const inputLockedRef = useRef(false);
  const llmStreamRef = useRef<any>(null);
  const lastSubmittedRef = useRef("");
  // Stored resolve function for the pending runLlmTurn Promise.
  // Cancel/unmount calls this so the Promise settles and handleSubmit
  // reaches its finally block instead of hanging forever.
  const llmResolveRef = useRef<((value: string) => void) | null>(null);
  // Per-invocation abort ref — when a new handleSubmit starts, the
  // previous invocation's abort ref is set to true so any surviving
  // runCell polling loop (in a setTimeout) stops even though
  // cancelRef has been reset to false by the new invocation.
  const prevAbortRef = useRef<{ current: boolean } | null>(null);

  // ---- Cleanup on unmount ----
  // Settle any pending LLM promise, then detach the stream so callbacks
  // don't fire on unmounted state.
  useEffect(() => {
    return () => {
      llmResolveRef.current?.("");
      llmResolveRef.current = null;
      const stream = llmStreamRef.current;
      if (stream) {
        stream.removeAllListeners();
        // Keep a no-op error handler so late transport errors don't
        // become uncaught EventEmitter exceptions.
        stream.on("error", () => {});
        llmStreamRef.current = null;
      }
    };
  }, []);

  // Context snapshot (taken on input focus)
  const notebookContextRef = useRef<NotebookContext | null>(null);
  const [editorContextLabel, setEditorContextLabel] = useState("");

  const [renameModalOpen, setRenameModalOpen] = useState(false);

  // ---- Shared session management ----
  const session = useAgentSession({
    chatSyncdb,
    eventName: "notebook-agent",
    project_id,
  });

  const autoNameSession = useAutoNameSession({
    session,
    model,
    project_id,
    tag: TAG,
  });

  // ---- Context capture (called on input focus) ----
  const updateContext = useCallback(() => {
    try {
      const ctx = getNotebookContext(actions as JupyterEditorActions);
      notebookContextRef.current = ctx;
      setEditorContextLabel(buildContextLabel(ctx));
    } catch {
      // Gracefully degrade if context capture fails
    }
  }, [actions]);

  // ---- Single LLM turn (returns assistant text) ----
  const runLlmTurn = useCallback(
    async (
      prompt: string,
      history: { role: "user" | "assistant" | "system"; content: string }[],
      system: string,
    ): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        let assistantContent = "";
        llmResolveRef.current = resolve;
        const stream = webapp_client.openai_client.queryStream({
          input: prompt,
          system,
          history,
          model,
          project_id,
          tag: TAG,
        });
        llmStreamRef.current = stream;

        stream.on("token", (token: string | null) => {
          if (session.cancelRef.current) {
            llmResolveRef.current = null;
            resolve(assistantContent);
            return;
          }
          if (token != null) {
            assistantContent += token;
            session.setMessages((prev) => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg?.sender === "assistant" && lastMsg.date === "") {
                // Create a new object — mutating lastMsg in-place would
                // violate React's immutability model (same object ref as
                // prev) and can cause skipped re-renders.
                updated[updated.length - 1] = {
                  ...lastMsg,
                  content: assistantContent,
                };
              } else {
                updated.push({
                  sender: "assistant",
                  content: assistantContent,
                  date: "",
                  event: "message",
                });
              }
              return updated;
            });
          } else {
            llmResolveRef.current = null;
            llmStreamRef.current = null;
            resolve(assistantContent);
          }
        });

        stream.on("error", (err: Error) => {
          llmResolveRef.current = null;
          llmStreamRef.current = null;
          reject(err);
        });
      });
    },
    [model, project_id, session.cancelRef, session.setMessages],
  );

  // ---- Submit handler with tool-calling loop ----
  const handleSubmit = useCallback(async (directInput?: string) => {
    const prompt = (directInput ?? input).trim();
    // Use the ref (not React state) to avoid the batching window where
    // `session.generating` is still false even though we've started.
    if (!prompt || session.generatingRef.current) return;

    session.setError("");
    // Abort any previous invocation's surviving polling loops before
    // resetting cancelRef — prevents the old runCell setTimeout from
    // seeing cancelRef=false and continuing to run.
    if (prevAbortRef.current) prevAbortRef.current.current = true;
    const abortRef = { current: false };
    prevAbortRef.current = abortRef;
    session.cancelRef.current = false;

    // Composite cancel signal — fires on user cancel OR new invocation.
    // Passed to runToolBatch/runCell instead of the raw cancelRef so
    // that stale polling loops from a previous submit are killed.
    const cancelSignal = {
      get current() {
        return session.cancelRef.current || abortRef.current;
      },
    };

    let activeSessionId = session.sessionId;
    if (!activeSessionId) {
      activeSessionId = uuid();
      session.setSessionId(activeSessionId);
    }

    const now = new Date().toISOString();
    const accountId =
      redux.getStore("account")?.get_account_id?.() ?? "unknown";

    session.writeMessage({
      date: now,
      sender: "user",
      content: prompt,
      account_id: accountId,
      msg_event: "message",
      session_id: activeSessionId,
    });

    // Push into local state immediately — SyncDB reloads are skipped
    // while generating, so this message would otherwise be invisible
    // in session.messages until generation ends.
    session.setMessages((prev) => [
      ...prev,
      {
        sender: "user" as const,
        content: prompt,
        date: now,
        event: "message",
        account_id: accountId,
      },
    ]);

    lastSubmittedRef.current = prompt;
    inputLockedRef.current = true;
    setInput("");
    setInputKey((k) => k + 1);
    session.setGenerating(true);

    try {
      // Build context-aware system prompt
      const ctx =
        notebookContextRef.current ??
        getNotebookContext(actions as JupyterEditorActions);
      const system = buildSystemPrompt(ctx);

      // Build history from conversation messages and tool results.
      const HISTORY_EVENTS = new Set(["message", "tool_result"]);
      const msgWithTime = session.messages
        .filter((m) => HISTORY_EVENTS.has(m.event))
        .map((m) => ({
          role:
            m.sender === "assistant"
              ? ("assistant" as const)
              : ("user" as const),
          content:
            m.event === "tool_result"
              ? `[Tool Result]\n${m.content}`
              : m.content,
          date: m.date,
        }));
      msgWithTime.sort(
        (a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf(),
      );
      let history = msgWithTime.map(({ role, content }) => ({ role, content }));

      let currentPrompt = prompt;
      let loops = MAX_TOOL_LOOPS;

      while (loops > 0) {
        loops--;

        const assistantText = await runLlmTurn(currentPrompt, history, system);
        if (cancelSignal.current) break;

        const assistantDate = new Date().toISOString();
        session.writeMessage({
          date: assistantDate,
          sender: "assistant",
          content: assistantText,
          msg_event: "message",
          session_id: activeSessionId,
        });

        const toolCalls = parseToolBlocks(assistantText);
        if (toolCalls.length === 0) break;

        // Run batch with live index refresh + scroll to affected cells
        const results = await runToolBatch(
          toolCalls,
          jupyterActions,
          ctx.language,
          actions as JupyterEditorActions,
          cancelSignal,
        );
        if (cancelSignal.current) break;

        const toolResultContent = results.join("\n\n");
        const toolDate = new Date().toISOString();
        session.writeMessage({
          date: toolDate,
          sender: "system",
          content: toolResultContent,
          msg_event: "tool_result",
          session_id: activeSessionId,
        });

        // Push tool result into local state so it's visible during
        // streaming and available for display (SyncDB reloads are
        // skipped while generating).
        session.setMessages((prev) => [
          ...prev,
          {
            sender: "system" as const,
            content: toolResultContent,
            date: toolDate,
            event: "tool_result",
          },
        ]);

        history.push({ role: "assistant", content: assistantText });
        history.push({
          role: "user",
          content: `[Tool Result]\n${toolResultContent}`,
        });

        currentPrompt = `Here are the tool results:\n\n${toolResultContent}\n\nContinue based on these results. If you need more information, use more tools. Otherwise, provide your answer.`;
      }
    } catch (err: any) {
      session.setError(err.message ?? `${err}`);
    } finally {
      inputLockedRef.current = false;
      session.setGenerating(false);
      llmStreamRef.current = null;
    }
  }, [
    input,
    actions,
    session.messages,
    session.sessionId,
    session.writeMessage,
    session.setGenerating,
    session.setError,
    session.setSessionId,
    session.cancelRef,
    model,
    project_id,
    runLlmTurn,
    jupyterActions,
  ]);

  // ---- Message renderer ----
  const renderMessage = useCallback(
    (msg: DisplayMessage, _i: number) => {
      if (msg.sender === "user") {
        return msg.content;
      }
      // Strip ```tool JSON blocks from assistant messages — they are
      // machine-readable tool invocations, not meant for the user.
      let content = msg.content;
      if (msg.sender === "assistant") {
        content = content.replace(/```tool\n[\s\S]*?```/g, "").trim();
      }
      // Tool results: show a compact summary of what happened.
      if (msg.event === "tool_result") {
        return formatToolResultForDisplay(content);
      }
      if (!content) return null;
      return (
        <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
          <StaticMarkdown value={content} />
        </FileContext.Provider>
      );
    },
    [],
  );

  // ---- Custom message styling ----
  const messageStyle = useCallback((msg: DisplayMessage) => {
    if (msg.sender === "user") return NB_USER_MSG_STYLE;
    if (msg.sender === "system") {
      if (msg.event === "error") return ERROR_MSG_STYLE;
      if (msg.event === "tool_result") return TOOL_RESULT_STYLE;
      return SYSTEM_MSG_STYLE;
    }
    return ASSISTANT_MSG_STYLE;
  }, []);

  // ---- Render ----
  return (
    <div style={CONTAINER_STYLE}>
      <AgentHeader
        title="Notebook Agent"
        model={model}
        setModel={setModel}
        project_id={project_id}
      />

      <AgentSessionBar
        session={session}
        onAutoName={autoNameSession}
        onRename={() => setRenameModalOpen(true)}
      />

      <AgentMessages
        session={session}
        renderMessage={renderMessage}
        messageStyle={messageStyle}
        fontSize={fontSize}
        emptyText="Ask questions about your notebook, request changes, or ask the agent to run cells. (Shift+Enter to send)"
      />

      <AgentError
        error={session.error}
        onClose={() => session.setError("")}
      />

      {/* Context indicator */}
      {editorContextLabel && (
        <div
          style={{
            flex: "0 0 auto",
            padding: "3px 12px",
            background: COLORS.YELL_LLL,
            fontSize: "0.85em",
            color: COLORS.GRAY_M,
            borderTop: `1px solid ${COLORS.GRAY_L}`,
          }}
        >
          {editorContextLabel}
        </div>
      )}

      <AgentInputArea
        session={session}
        onSubmit={() => handleSubmit()}
        onCancel={() => {
          // Settle the pending runLlmTurn promise so handleSubmit
          // reaches its finally block instead of hanging forever.
          llmResolveRef.current?.("");
          llmResolveRef.current = null;
          // Detach the stream so no more tokens are processed.
          const stream = llmStreamRef.current;
          if (stream) {
            stream.removeAllListeners();
            stream.on("error", () => {});
            llmStreamRef.current = null;
          }
          inputLockedRef.current = false;
          setInput(lastSubmittedRef.current);
          setInputKey((k) => k + 1);
        }}
        sendDisabled={!input.trim()}
        showDone
      >
        <div
          onFocus={updateContext}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setEditorContextLabel("");
            }
          }}
        >
          <MarkdownInput
            key={inputKey}
            value={input}
            onChange={(v) => {
              if (!inputLockedRef.current) setInput(v);
            }}
            onShiftEnter={(value) => {
              handleSubmit(value);
            }}
            placeholder="Ask about your notebook..."
            height="auto"
            editBarStyle={{ overflow: "auto" }}
            style={{ minHeight: "72px", maxHeight: "200px", overflow: "auto" }}
          />
        </div>
      </AgentInputArea>

      <RenameModal
        open={renameModalOpen}
        currentName={session.sessionNames.get(session.sessionId) ?? ""}
        onSave={(name) => {
          session.writeSessionName(name);
          setRenameModalOpen(false);
        }}
        onCancel={() => setRenameModalOpen(false)}
      />
    </div>
  );
}
