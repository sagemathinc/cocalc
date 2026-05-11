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

import { Switch, Tooltip } from "antd";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { LLMCostEstimationChat } from "@cocalc/frontend/chat/llm-cost-estimation";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import { uuid } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import {
  AgentError,
  AgentHeader,
  AgentInputArea,
  AgentMessages,
  AgentRollbackHint,
  AgentSessionBar,
  ASSISTANT_MSG_STYLE,
  CONTAINER_STYLE,
  ERROR_MSG_STYLE,
  RenameModal,
  runStreamingTurn,
  SYSTEM_MSG_STYLE,
  useAgentSession,
  useAutoNameSession,
  useCostEstimate,
} from "@cocalc/frontend/frame-editors/llm/agent-base";
import type {
  DisplayMessage,
  StreamHandle,
} from "@cocalc/frontend/frame-editors/llm/agent-base";
import { normalizeAssistantSeed } from "@cocalc/frontend/frame-editors/llm/assistant-seed";
import {
  buildBoundedHistory,
  estimateConversationTokens,
  getAgentInputTokenBudget,
  type AgentHistoryMessage,
} from "@cocalc/frontend/frame-editors/llm/history-budget";

import {
  TAG,
  MAX_TOOL_LOOPS,
  READ_ONLY_TOOL_NAMES,
  buildPostToolPrompt,
  buildContextLabel,
  buildSystemPrompt,
  compactAssistantMessageForHistory,
  compactToolResultForHistory,
  getFewShotExamples,
  getNotebookContext,
  parseToolBlocks,
  runToolBatch,
} from "./notebook-agent-utils";
import type { NotebookContext } from "./notebook-agent-utils";
import type { JupyterEditorActions } from "./actions";
import { CollapsibleDiffs } from "../llm/coding-agent-components";
import { DIFF_MAX_HEIGHT } from "../llm/coding-agent-types";

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
  fontSize: "0.85em",
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
function summarizeJson(tool: string, data: any): string | React.ReactElement {
  let summary: string;
  switch (tool) {
    case "cell_count":
      summary = `${data.cell_count} cells`;
      break;
    case "get_cell":
    case "get_cells":
      summary = "fetched cell data";
      break;
    case "set_cell":
      summary =
        data.status === "updated"
          ? `set cell #${data.index}`
          : `set_cell: ${data.error ?? data.status}`;
      break;
    case "edit_cell":
      if (data.status === "updated") {
        summary = `edited cell #${data.index} (${data.applied} applied)`;
        break;
      }
      if (data.status === "no_changes") {
        summary = `edit_cell #${data.index}: no match`;
        break;
      }
      summary = `edit_cell: ${data.error ?? data.status}`;
      break;
    case "insert_cells":
      if (data.status === "inserted") {
        summary = `inserted ${data.cells?.length ?? 0} cell(s)`;
        break;
      }
      summary = `insert_cells: ${data.error ?? data.status}`;
      break;
    case "run_cell": {
      if (data.status === "completed") {
        const out = data.output?.trim();
        if (!out) {
          summary = `ran cell #${data.index}`;
          break;
        }
        const short = out.length > 60 ? out.slice(0, 60) + "..." : out;
        summary = `ran cell #${data.index} \u2192 ${short}`;
        break;
      }
      if (data.status === "timeout") {
        summary = `ran cell #${data.index} (timed out)`;
        break;
      }
      if (data.status === "pending_confirmation") {
        summary = `cell #${data.index ?? "?"} queued`;
        break;
      }
      summary = `run_cell: ${data.error ?? data.status}`;
      break;
    }
    default:
      summary = `${tool}: ${data.error ?? data.status ?? "done"}`;
      break;
  }

  if (
    typeof data.diff_preview === "string" &&
    data.diff_preview.trim() !== ""
  ) {
    return (
      <div>
        <div>{summary}</div>
        <div style={{ marginTop: 4, fontSize: "1.25em" }}>
          <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
            <CollapsibleDiffs maxHeight={DIFF_MAX_HEIGHT} fontSize="0.82em">
              <StaticMarkdown value={data.diff_preview} />
            </CollapsibleDiffs>
          </FileContext.Provider>
        </div>
      </div>
    );
  }

  return summary;
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

  if (tool === "get_cell" || tool === "get_cells") {
    return (
      <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
        <CollapsibleDiffs maxHeight={DIFF_MAX_HEIGHT} fontSize="0.82em">
          <StaticMarkdown value={rest} />
        </CollapsibleDiffs>
      </FileContext.Provider>
    );
  }

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
  // Split on tool-result boundaries (**tool_name**: ...) rather than
  // bare \n\n, since multi-line results (e.g. get_cells) contain \n\n
  // within a single entry and naive splitting fragments them.
  const entries = content
    .split(/\n\n(?=\*{0,2}\w+\*{0,2}\s*(?:\([^)]*\))?\s*:)/)
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
  const { project_id, actions, desc, id: frameId } = useFrameContext();
  const projectsStore = redux.getStore("projects");
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
  const llm_markup = useTypedRedux("customize", "llm_markup");
  const projectReadOnly =
    projectsStore.hasLanguageModelEnabled(project_id, "help-me-fix-hint") &&
    !projectsStore.hasFullLanguageModelEnabled(project_id);
  const llmTag = projectReadOnly ? "explain" : TAG;
  const jupyterActions = (actions as unknown as JupyterEditorActions)
    .jupyter_actions;
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const inputLockedRef = useRef(false);
  const llmStreamRef = useRef<StreamHandle | null>(null);
  const lastSubmittedRef = useRef("");
  const handleSubmitRef = useRef<
    (directInput?: string, opts?: { readOnly?: boolean }) => Promise<void>
  >(async () => {});
  const processedAssistantSeedRef = useRef("");
  // Stored resolve function for the pending runLlmTurn Promise.
  // Cancel/unmount calls this so the Promise settles and handleSubmit
  // reaches its finally block instead of hanging forever.
  const llmResolveRef = useRef<((value: string) => void) | null>(null);
  // Per-invocation abort ref — when a new handleSubmit starts, the
  // previous invocation's abort ref is set to true so any surviving
  // runCell polling loop (in a setTimeout) stops even though
  // cancelRef has been reset to false by the new invocation.
  const prevAbortRef = useRef<{ current: boolean } | null>(null);
  // Auto-run: automatically execute modified/inserted code cells.
  // Default on — the toggle is visible right next to the Send button
  // so the user can easily disable it.
  const [autoRun, setAutoRun] = useState(false);
  const autoRunRef = useRef(false);
  autoRunRef.current = autoRun;

  // ---- Cleanup on unmount ----
  // Settle any pending LLM promise, then detach the stream so callbacks
  // don't fire on unmounted state.
  useEffect(() => {
    return () => {
      clearEstimate();
      // Abort any surviving runCell polling loop from a previous submit.
      if (prevAbortRef.current) prevAbortRef.current.current = true;
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
  const [readOnlySessionId, setReadOnlySessionId] = useState<string>();

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
    tag: llmTag,
  });

  const buildHistoryForLlm = useCallback(
    (prompt: string, system: string): AgentHistoryMessage[] => {
      const historyEvents = new Set(["message", "tool_result"]);
      const msgWithTime = session.messages
        .filter((m) => historyEvents.has(m.event))
        .map((m) => ({
          role:
            m.sender === "assistant"
              ? ("assistant" as const)
              : ("user" as const),
          content:
            m.event === "tool_result"
              ? `[Tool Result]\n${compactToolResultForHistory(m.content)}`
              : m.sender === "assistant"
                ? compactAssistantMessageForHistory(m.content)
                : m.content,
          date: m.date,
        }));
      msgWithTime.sort(
        (a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf(),
      );
      const fewShot = getFewShotExamples(projectReadOnly);
      return buildBoundedHistory({
        system,
        input: prompt,
        history: [
          ...fewShot,
          ...msgWithTime.map(({ role, content }) => ({ role, content })),
        ],
        maxInputTokens: getAgentInputTokenBudget(model),
      }).history;
    },
    [model, projectReadOnly, session.messages],
  );

  const estimateTokens = useCallback(
    (prompt: string) => {
      const ctx =
        notebookContextRef.current ??
        getNotebookContext(actions as JupyterEditorActions);
      const readOnly =
        projectReadOnly ||
        (session.sessionId != null && readOnlySessionId === session.sessionId);
      const system = buildSystemPrompt(ctx, { readOnly, autoRun: autoRunRef.current });
      const history = buildHistoryForLlm(prompt, system);
      return estimateConversationTokens({ system, input: prompt, history });
    },
    [
      actions,
      buildHistoryForLlm,
      projectReadOnly,
      readOnlySessionId,
      session.sessionId,
    ],
  );

  const { costEstimate, updateEstimate, clearEstimate } = useCostEstimate({
    model,
    isCoCalcCom,
    llm_markup,
    messages: session.messages,
    estimateTokens,
  });

  const handleInputChange = useCallback(
    (value: string) => {
      if (inputLockedRef.current) return;
      setInput(value);
      updateEstimate(value);
    },
    [updateEstimate],
  );

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
        llmResolveRef.current = resolve;
        const stream = runStreamingTurn({
          input: prompt,
          system,
          history,
          model,
          project_id,
          tag: llmTag,
          cancelRef: session.cancelRef,
          onToken(accumulated, _token) {
            session.setMessages((prev) => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg?.sender === "assistant" && lastMsg.date === "") {
                // Create a new object — mutating lastMsg in-place would
                // violate React's immutability model (same object ref as
                // prev) and can cause skipped re-renders.
                updated[updated.length - 1] = {
                  ...lastMsg,
                  content: accumulated,
                };
              } else {
                updated.push({
                  sender: "assistant",
                  content: accumulated,
                  date: "",
                  event: "message",
                });
              }
              return updated;
            });
          },
          onComplete(fullContent) {
            llmResolveRef.current = null;
            llmStreamRef.current = null;
            resolve(fullContent);
          },
          onError(err) {
            llmResolveRef.current = null;
            llmStreamRef.current = null;
            reject(err);
          },
        });
        llmStreamRef.current = stream;
      });
    },
    [llmTag, model, project_id, session.cancelRef, session.setMessages],
  );

  // ---- Submit handler with tool-calling loop ----
  const handleSubmit = useCallback(
    async (directInput?: string, opts?: { readOnly?: boolean }) => {
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
      const readOnly =
        projectReadOnly ||
        opts?.readOnly === true ||
        readOnlySessionId === activeSessionId;
      if (opts?.readOnly === true && readOnlySessionId !== activeSessionId) {
        setReadOnlySessionId(activeSessionId);
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
        const system = buildSystemPrompt(ctx, { readOnly, autoRun: autoRunRef.current });

        let history: AgentHistoryMessage[] = buildHistoryForLlm(prompt, system);
        let currentPrompt = prompt;
        let loops = MAX_TOOL_LOOPS;

        while (loops > 0) {
          loops--;

          const boundedHistory = buildBoundedHistory({
            system,
            input: currentPrompt,
            history,
            maxInputTokens: getAgentInputTokenBudget(model),
          }).history;

          const assistantText = await runLlmTurn(
            currentPrompt,
            boundedHistory,
            system,
          );
          if (cancelSignal.current) {
            // Remove the unpersisted draft message (date === "") so it
            // doesn't pollute the display or get fed back as LLM history.
            session.setMessages((prev) =>
              prev.filter((m) => !(m.sender === "assistant" && m.date === "")),
            );
            break;
          }

          const assistantDate = new Date().toISOString();
          session.writeMessage({
            date: assistantDate,
            sender: "assistant",
            content: assistantText,
            msg_event: "message",
            session_id: activeSessionId,
          });

          const toolCalls = parseToolBlocks(assistantText).filter(
            ({ name }) => !readOnly || READ_ONLY_TOOL_NAMES.has(name),
          );
          if (toolCalls.length === 0) break;

          // Run batch with live index refresh + scroll to affected cells
          const results = await runToolBatch(
            toolCalls,
            jupyterActions,
            ctx.language,
            actions as JupyterEditorActions,
            cancelSignal,
            autoRunRef.current,
          );
          if (cancelSignal.current) break;

          const rawToolResultContent = results.join("\n\n");
          const toolResultContent =
            compactToolResultForHistory(rawToolResultContent);
          const toolDate = new Date().toISOString();
          session.writeMessage({
            date: toolDate,
            sender: "system",
            content: rawToolResultContent,
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
              content: rawToolResultContent,
              date: toolDate,
              event: "tool_result",
            },
          ]);

          // The current user prompt (original instruction on the first
          // iteration, buildPostToolPrompt on subsequent ones) was sent as
          // `input` for this turn but isn't in the history array yet.
          // Push it now so the next tool-loop turn sees the full exchange.
          // (buildHistoryForLlm uses a stale React closure, so the
          // original prompt is never in the initial history.)
          history.push({ role: "user", content: currentPrompt });
          history.push({
            role: "assistant",
            content: compactAssistantMessageForHistory(assistantText),
          });
          history.push({
            role: "user",
            content: `[Tool Result]\n${toolResultContent}`,
          });

          currentPrompt = buildPostToolPrompt(toolCalls, toolResultContent);
        }
      } catch (err: any) {
        session.setError(err.message ?? `${err}`);
      } finally {
        inputLockedRef.current = false;
        session.setGenerating(false);
        llmStreamRef.current = null;
      }
    },
    [
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
      projectReadOnly,
      readOnlySessionId,
      runLlmTurn,
      jupyterActions,
    ],
  );
  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    const seed = normalizeAssistantSeed(desc.get("assistant_seed"));
    if (!seed || processedAssistantSeedRef.current === seed.id) return;
    processedAssistantSeedRef.current = seed.id;
    actions.set_frame_tree({ id: frameId, assistant_seed: undefined });
    // Switch model if the seed specifies one (e.g. from cell-tool dialog).
    if (seed.model) {
      setModel(seed.model as any);
    }
    if (seed.prefill) {
      // Pre-fill mode: start a fresh session and set the input text
      // without submitting, so the user can review/edit before sending.
      session.handleNewSession();
      setInput(seed.prompt);
      setInputKey((k) => k + 1);
      updateEstimate(seed.prompt);
      // Move cursor to end of the prefilled text after the editor remounts.
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel && sel.focusNode) {
          sel.collapseToEnd();
        }
      }, 100);
      return;
    }
    if (seed.insert) {
      // Insert mode: append to the existing input (e.g. a cell reference like
      // "#5") without starting a new session or submitting. Remount the input
      // so the cursor lands at the end of the appended text.
      setInput((prev) => {
        const sep = prev && !prev.endsWith(" ") ? " " : "";
        const next = `${prev}${sep}${seed.prompt} `;
        updateEstimate(next);
        return next;
      });
      setInputKey((k) => k + 1);
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel && sel.focusNode) {
          sel.collapseToEnd();
        }
      }, 100);
      return;
    }
    if (seed.forceNewTurn !== false) {
      session.handleNewSession();
    }
    setTimeout(() => {
      void handleSubmitRef.current(seed.prompt, {
        readOnly: seed.mode === "hint",
      });
    }, 0);
  }, [actions, desc, frameId, session.handleNewSession]);

  // ---- Message renderer ----
  const renderMessage = useCallback((msg: DisplayMessage, _i: number) => {
    if (msg.sender === "user") {
      return (
        <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
          <StaticMarkdown value={msg.content} />
        </FileContext.Provider>
      );
    }
    // Strip ```tool JSON blocks from assistant messages — they are
    // machine-readable tool invocations, not meant for the user.
    let content = msg.content;
    if (msg.sender === "assistant") {
      // Strip tool invocation blocks (machine-readable JSON)
      content = content.replace(/^```tool\n[\s\S]*?\n```\s*$/gm, "").trim();
      // Also strip unclosed tool blocks — some models omit the closing ```
      content = content.replace(/^```tool\n[\s\S]*/m, "").trim();
      // Some LLMs echo the tool call JSON or code with literal \n escapes
      // in their prose. Convert escaped newlines to real ones so
      // StaticMarkdown can render them properly — but only outside
      // backtick-delimited code (where \n may be intentional).
      content = content.replace(
        /(```[\s\S]*?```|`[^`]*`)|\\n/g,
        (_match, codeBlock) => (codeBlock ? codeBlock : "\n"),
      );
    }
    // Tool results: show a compact summary of what happened.
    if (msg.event === "tool_result") {
      return formatToolResultForDisplay(content);
    }
    if (!content) {
      // Tool-only assistant turn: render a faint indicator so the user
      // sees that the model did something. Without this, models that
      // emit only tool blocks (no prose) leave a blank message bubble.
      if (msg.sender === "assistant") {
        const toolCalls = parseToolBlocks(msg.content);
        if (toolCalls.length > 0) {
          return (
            <div style={TOOL_RESULT_STYLE}>
              Used tool{toolCalls.length > 1 ? "s" : ""}:{" "}
              {toolCalls.map((t) => t.name).join(", ")}
            </div>
          );
        }
      }
      return null;
    }
    return (
      <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
        <StaticMarkdown value={content} />
      </FileContext.Provider>
    );
  }, []);

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

  const openTimeTravel = useCallback(() => {
    actions.time_travel?.({ frame: true });
  }, [actions]);

  // ---- Render ----
  return (
    <div style={CONTAINER_STYLE}>
      <AgentHeader
        title="Notebook Agent"
        model={model}
        setModel={setModel}
        project_id={project_id}
        helpContent={
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            <li>
              Ask the agent to edit, insert, or explain cells. It is aware of
              the currently selected cell and its context.
            </li>
            <li>
              The agent can <b>read</b>, <b>edit</b>, <b>insert</b>, and{" "}
              <b>run</b> cells on your behalf.
            </li>
            <li>
              Click into a cell first to give the agent context about what you
              are working on.
            </li>
            <li>
              Use <b>Done</b> to close a turn and start fresh — this saves
              tokens.
            </li>
          </ul>
        }
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

      <AgentError error={session.error} onClose={() => session.setError("")} />

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

      {/* Auto-run toggle */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "6px 12px",
          borderTop: `1px solid ${COLORS.GRAY_L}`,
          background: COLORS.GRAY_LLL,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <Tooltip title="Automatically run modified/inserted code cells">
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
              fontSize: "0.85em",
            }}
          >
            <Switch size="small" checked={autoRun} onChange={setAutoRun} />
            Auto-run
          </label>
        </Tooltip>
      </div>

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
        aboveButtons={
          costEstimate ? (
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
          ) : undefined
        }
        belowInput={<AgentRollbackHint onOpenTimeTravel={openTimeTravel} />}
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
            autoFocus
            // Default to plain-text input. The slate WYSIWYG mode escapes
            // 17 markdown metachars on serialize ("foo(x)" -> "foo\(x\)",
            // "<" -> "&lt;", "-U" -> "\-U"), which silently corrupts
            // prompts sent to the LLM. Defaulting to markdown avoids that
            // for most users; the editbar toggle is still available for
            // anyone who wants WYSIWYG.
            defaultMode="markdown"
            onChange={handleInputChange}
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
