/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Notebook AI Agent – an LLM-powered assistant for Jupyter notebooks.

Uses the shared agent-base hook and UI components for session/SyncDB
management.  This file contains only notebook-agent-specific logic:
- Tool-calling loop (up to 10 iterations)
- Tool parsing and execution against JupyterActions
- System prompt for notebook context
*/

import { Input } from "antd";
import { useCallback, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux } from "@cocalc/frontend/app-framework";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { uuid } from "@cocalc/util/misc";
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

const { TextArea } = Input;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TAG = "notebook-agent";
const MAX_OUTPUT_CHARS = 4000;
const CELL_RUN_POLL_MS = 500;
const CELL_RUN_TIMEOUT_MS = 120_000;

/* ------------------------------------------------------------------ */
/*  System prompt                                                      */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(kernelName: string, language: string): string {
  return `You are an AI assistant for a Jupyter notebook using the ${kernelName || "unknown"} kernel (${language || "unknown"} language).

You help the user understand, modify, and run cells in their notebook.

## Available Tools

To interact with the notebook, emit tool blocks in your response. Each tool block starts with \`\`\`tool on its own line, followed by a JSON object with "name" and "args", then a closing \`\`\`.

### cell_count
Get the total number of cells in the notebook.
\`\`\`tool
{"name": "cell_count", "args": {}}
\`\`\`

### get_cell
Get a cell's input and output. "index" is 0-based.
\`\`\`tool
{"name": "get_cell", "args": {"index": 0}}
\`\`\`

### get_cells
Get a range of cells. "start" and "end" are 0-based, inclusive.
\`\`\`tool
{"name": "get_cells", "args": {"start": 0, "end": 4}}
\`\`\`

### run_cell
Run a cell by its 0-based index. The result will be reported once completion.
\`\`\`tool
{"name": "run_cell", "args": {"index": 0}}
\`\`\`

### insert_cell
Insert a new cell after the cell at the given 0-based index. Use index -1 to insert at the very beginning. "cell_type" is "code" or "markdown" (default "code").
\`\`\`tool
{"name": "insert_cell", "args": {"after_index": 2, "content": "print('hello')", "cell_type": "code"}}
\`\`\`

### set_cell
Replace the contents of the cell at the given 0-based index.
\`\`\`tool
{"name": "set_cell", "args": {"index": 0, "content": "new code here"}}
\`\`\`

### delete_cell
Delete the cell at the given 0-based index.
\`\`\`tool
{"name": "delete_cell", "args": {"index": 2}}
\`\`\`

## Important
- You can include multiple tool blocks in a single response.
- After tool results are returned, you will have a chance to continue.
- Always inspect cells before modifying them.
- Keep explanations concise.
- If the user asks about the notebook content, use get_cells to look at it first.`;
}

/* ------------------------------------------------------------------ */
/*  Tool parsing                                                       */
/* ------------------------------------------------------------------ */

interface ToolCall {
  name: string;
  args: Record<string, any>;
}

function parseToolBlocks(text: string): ToolCall[] {
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
/*  Tool helpers                                                       */
/* ------------------------------------------------------------------ */

function truncate(s: string, maxLen: number = MAX_OUTPUT_CHARS): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `\n... (truncated, ${s.length} chars total)`;
}

function getCellOutput(cell: any): string {
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
/*  Tool dispatcher                                                    */
/* ------------------------------------------------------------------ */

async function runTool(
  toolCall: ToolCall,
  jupyterActions: JupyterActions,
): Promise<string> {
  const store = jupyterActions.store;
  const cellList: string[] = store.get("cell_list")?.toJS() ?? [];

  switch (toolCall.name) {
    case "cell_count": {
      return JSON.stringify({ cell_count: cellList.length });
    }

    case "get_cell": {
      const idx = toolCall.args.index ?? 0;
      if (idx < 0 || idx >= cellList.length) {
        return JSON.stringify({
          error: `Index ${idx} out of range (0..${cellList.length - 1})`,
        });
      }
      const cellId = cellList[idx];
      const cell = store.getIn(["cells", cellId]) as any;
      if (!cell) return JSON.stringify({ error: "Cell not found" });
      return JSON.stringify({
        index: idx,
        id: cellId,
        cell_type: cell.get("cell_type") ?? "code",
        input: truncate(cell.get("input") ?? ""),
        output: truncate(getCellOutput(cell)),
        state: cell.get("state") ?? null,
      });
    }

    case "get_cells": {
      const start = Math.max(0, toolCall.args.start ?? 0);
      const end = Math.min(
        cellList.length - 1,
        toolCall.args.end ?? cellList.length - 1,
      );
      const cells: any[] = [];
      for (let i = start; i <= end; i++) {
        const cellId = cellList[i];
        const cell = store.getIn(["cells", cellId]) as any;
        if (!cell) continue;
        cells.push({
          index: i,
          id: cellId,
          cell_type: cell.get("cell_type") ?? "code",
          input: truncate(cell.get("input") ?? "", 1000),
          output: truncate(getCellOutput(cell), 1000),
        });
      }
      return JSON.stringify({ cells, total: cellList.length });
    }

    case "run_cell": {
      const idx = toolCall.args.index ?? 0;
      if (idx < 0 || idx >= cellList.length) {
        return JSON.stringify({
          error: `Index ${idx} out of range (0..${cellList.length - 1})`,
        });
      }
      const cellId = cellList[idx];
      jupyterActions.run_cell(cellId, true);

      // Poll until idle or timeout
      const deadline = Date.now() + CELL_RUN_TIMEOUT_MS;
      await new Promise<void>((resolve) => {
        const check = () => {
          const cell = store.getIn(["cells", cellId]) as any;
          const state = cell?.get("state");
          if (!state || state === "idle" || Date.now() >= deadline) {
            resolve();
            return;
          }
          setTimeout(check, CELL_RUN_POLL_MS);
        };
        setTimeout(check, CELL_RUN_POLL_MS);
      });

      const cell = store.getIn(["cells", cellId]) as any;
      return JSON.stringify({
        status: "completed",
        index: idx,
        id: cellId,
        output: truncate(cell ? getCellOutput(cell) : ""),
      });
    }

    case "insert_cell": {
      const afterIdx = toolCall.args.after_index ?? -1;
      const content = toolCall.args.content ?? "";
      const cellType = toolCall.args.cell_type ?? "code";
      let newId: string;
      if (afterIdx < 0 || cellList.length === 0) {
        newId = jupyterActions.insert_cell_at(0, true);
      } else {
        const clampedIdx = Math.min(afterIdx, cellList.length - 1);
        const afterCellId = cellList[clampedIdx];
        newId = jupyterActions.insert_cell_adjacent(afterCellId, 1, true);
      }
      if (cellType !== "code") {
        jupyterActions.set_cell_type(newId, cellType);
      }
      if (content) {
        jupyterActions.set_cell_input(newId, content, true);
      }
      const newCellList: string[] = store.get("cell_list")?.toJS() ?? [];
      return JSON.stringify({
        status: "inserted",
        id: newId,
        index: newCellList.indexOf(newId),
        cell_type: cellType,
      });
    }

    case "set_cell": {
      const idx = toolCall.args.index ?? 0;
      if (idx < 0 || idx >= cellList.length) {
        return JSON.stringify({
          error: `Index ${idx} out of range (0..${cellList.length - 1})`,
        });
      }
      const cellId = cellList[idx];
      jupyterActions.set_cell_input(cellId, toolCall.args.content ?? "", true);
      return JSON.stringify({ status: "updated", index: idx, id: cellId });
    }

    case "delete_cell": {
      const idx = toolCall.args.index ?? 0;
      if (idx < 0 || idx >= cellList.length) {
        return JSON.stringify({
          error: `Index ${idx} out of range (0..${cellList.length - 1})`,
        });
      }
      const cellId = cellList[idx];
      jupyterActions.delete_cells([cellId]);
      return JSON.stringify({ status: "deleted", index: idx, id: cellId });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NotebookAgent({ chatSyncdb }: { chatSyncdb: any }) {
  const { project_id, actions } = useFrameContext();
  const jupyterActions: JupyterActions = (actions as any).jupyter_actions;
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [input, setInput] = useState("");
  const llmStreamRef = useRef<any>(null);

  // ---- Shared session management ----
  const session = useAgentSession({
    chatSyncdb,
    eventName: "notebook-agent",
    project_id,
  });

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

    setInput("");
    session.setGenerating(true);

    try {
      const kernelName =
        jupyterActions.store?.getIn(["kernel_info", "display_name"]) ?? "";
      const language =
        jupyterActions.store?.getIn(["kernel_info", "language"]) ?? "";
      const system = buildSystemPrompt(
        kernelName as string,
        language as string,
      );

      // Build history from conversation messages and tool results.
      // Both are needed: "message" events are the user/assistant turns,
      // "tool_result" events are system responses the LLM needs to see.
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
      let maxLoops = 10;

      while (maxLoops > 0) {
        maxLoops--;

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

        const results: string[] = [];
        for (const tc of toolCalls) {
          try {
            const result = await runTool(tc, jupyterActions);
            results.push(`**${tc.name}**: ${result}`);
          } catch (err: any) {
            results.push(`**${tc.name}**: Error — ${err.message ?? err}`);
          }
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

      <AgentInputArea
        session={session}
        onSubmit={handleSubmit}
        sendDisabled={!input.trim()}
      >
        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your notebook... (Shift+Enter to send)"
          autoSize={{ minRows: 1, maxRows: 6 }}
          disabled={session.generating}
          style={{ flex: 1 }}
        />
      </AgentInputArea>
    </div>
  );
}
