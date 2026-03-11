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

import { Button, Input } from "antd";
import { useCallback, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
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
  CONTAINER_STYLE,
  useAgentSession,
} from "@cocalc/frontend/frame-editors/llm/agent-base";
import type { DisplayMessage } from "@cocalc/frontend/frame-editors/llm/agent-base";

import {
  TAG,
  MAX_TOOL_LOOPS,
  buildContextLabel,
  buildSystemPrompt,
  getNotebookContext,
  parseToolBlocks,
  runCell,
  runToolBatch,
} from "./notebook-agent-utils";
import type { NotebookContext, PendingRun } from "./notebook-agent-utils";
import type { JupyterEditorActions } from "./actions";

const { TextArea } = Input;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NotebookAgent({ chatSyncdb }: { chatSyncdb: any }) {
  const { project_id, actions } = useFrameContext();
  const jupyterActions: JupyterActions = (actions as any).jupyter_actions;
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [input, setInput] = useState("");
  const llmStreamRef = useRef<any>(null);
  const lastSubmittedRef = useRef("");

  // Context snapshot (taken on input focus)
  const notebookContextRef = useRef<NotebookContext | null>(null);
  const [editorContextLabel, setEditorContextLabel] = useState("");

  // Pending cell runs awaiting user confirmation
  const [pendingRuns, setPendingRuns] = useState<PendingRun[]>([]);

  // ---- Shared session management ----
  const session = useAgentSession({
    chatSyncdb,
    eventName: "notebook-agent",
    project_id,
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
            resolve(assistantContent);
            return;
          }
          if (token != null) {
            assistantContent += token;
            session.setMessages((prev) => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg?.sender === "assistant" && lastMsg.date === "") {
                lastMsg.content = assistantContent;
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
            llmStreamRef.current = null;
            resolve(assistantContent);
          }
        });

        stream.on("error", (err: Error) => {
          llmStreamRef.current = null;
          reject(err);
        });
      });
    },
    [model, project_id, session.cancelRef, session.setMessages],
  );

  // ---- Confirm/dismiss pending cell runs ----
  const handleConfirmRun = useCallback(
    async (run: PendingRun) => {
      setPendingRuns((prev) => prev.filter((r) => r.cellId !== run.cellId));
      try {
        const result = await runCell(jupyterActions, run.cellId, run.cellIndex);
        const activeSessionId = session.sessionId;
        if (activeSessionId) {
          session.writeMessage({
            date: new Date().toISOString(),
            sender: "system",
            content: `**run_cell** (cell #${run.cellIndex}): ${result}`,
            msg_event: "tool_result",
            session_id: activeSessionId,
          });
        }
      } catch (err: any) {
        session.setError(
          `Failed to run cell #${run.cellIndex}: ${err.message ?? err}`,
        );
      }
    },
    [jupyterActions, session.sessionId, session.writeMessage, session.setError],
  );

  const handleDismissRun = useCallback(
    (run: PendingRun) => {
      setPendingRuns((prev) => prev.filter((r) => r.cellId !== run.cellId));
      const activeSessionId = session.sessionId;
      if (activeSessionId) {
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `**run_cell** (cell #${run.cellIndex}): User declined to run this cell.`,
          msg_event: "tool_result",
          session_id: activeSessionId,
        });
      }
    },
    [session.sessionId, session.writeMessage],
  );

  // ---- Submit handler with tool-calling loop ----
  const handleSubmit = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || session.generating) return;

    session.setError("");
    session.cancelRef.current = false;

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

    lastSubmittedRef.current = prompt;
    setInput("");
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
        if (session.cancelRef.current) break;

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

        // Run batch with live index refresh
        const { results, pendingRuns: newPendingRuns } = await runToolBatch(
          toolCalls,
          jupyterActions,
          ctx.language,
        );

        // Add any new pending runs
        if (newPendingRuns.length > 0) {
          setPendingRuns((prev) => [...prev, ...newPendingRuns]);
        }

        const toolResultContent = results.join("\n\n");
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: toolResultContent,
          msg_event: "tool_result",
          session_id: activeSessionId,
        });

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
      session.setGenerating(false);
      llmStreamRef.current = null;
    }
  }, [
    input,
    actions,
    session.messages,
    session.generating,
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
      return <StaticMarkdown value={msg.content} />;
    },
    [],
  );

  // ---- Key handler for shift+enter ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // ---- Render ----
  return (
    <div style={CONTAINER_STYLE}>
      <AgentHeader
        title="Notebook Agent"
        model={model}
        setModel={setModel}
        project_id={project_id}
      />

      <AgentSessionBar session={session} />

      <AgentMessages
        session={session}
        renderMessage={renderMessage}
        emptyText="Ask questions about your notebook, request changes, or ask the agent to run cells. (Shift+Enter to send)"
      />

      <AgentError
        error={session.error}
        onClose={() => session.setError("")}
      />

      {/* Pending runs bar */}
      {pendingRuns.length > 0 && (
        <div
          style={{
            flex: "0 0 auto",
            padding: "4px 12px",
            background: COLORS.ANTD_BG_BLUE_L,
            borderTop: `1px solid ${COLORS.BLUE_LLL}`,
            fontSize: "0.85em",
          }}
        >
          {pendingRuns.map((run) => (
            <div
              key={run.cellId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "2px 0",
              }}
            >
              <Icon name="play" />
              <span>Run cell #{run.cellIndex}?</span>
              <span style={{ flex: 1 }} />
              <Button
                size="small"
                type="primary"
                onClick={() => handleConfirmRun(run)}
              >
                Run
              </Button>
              <Button size="small" onClick={() => handleDismissRun(run)}>
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      )}

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
        onSubmit={handleSubmit}
        onCancel={() => setInput(lastSubmittedRef.current)}
        sendDisabled={!input.trim()}
      >
        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={updateContext}
          placeholder="Ask about your notebook... (Shift+Enter to send)"
          autoSize={{ minRows: 1, maxRows: 6 }}
          disabled={session.generating}
          style={{ flex: 1 }}
        />
      </AgentInputArea>
    </div>
  );
}
