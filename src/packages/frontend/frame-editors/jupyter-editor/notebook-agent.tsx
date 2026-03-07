/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Notebook AI Agent – an LLM-powered assistant for Jupyter notebooks.

The agent can inspect cells (input/output), insert new cells, and run
cells.  It communicates with the LLM via structured ```tool blocks that
are parsed client-side, executed against JupyterActions, and the results
fed back for the next turn.

When used inside the side-chat panel it piggybacks on the chat syncdb
(records with event="notebook-agent").
*/

import { Alert, Button, Input, Popconfirm, Space, Spin, Tooltip } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux } from "@cocalc/frontend/app-framework";
import type { CSS } from "@cocalc/frontend/app-framework";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import LLMSelector from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { uuid } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";

const { TextArea } = Input;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DisplayMessage {
  sender: "user" | "assistant" | "system";
  content: string;
  date: string;
  event: string; // "message" | "tool_result"
  account_id?: string;
}

/** A tool invocation parsed from the LLM response. */
interface ToolCall {
  name: string;
  args: Record<string, any>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TAG = "notebook-agent";
const NOTEBOOK_AGENT_EVENT = "notebook-agent";
const MAX_OUTPUT_CHARS = 4000;

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
  background: "#f6ffed",
  borderRadius: 8,
  fontSize: "0.9em",
} as const;

const ERROR_MSG_STYLE: CSS = {
  marginBottom: 8,
  padding: "8px 12px",
  background: "#fff2f0",
  border: "1px solid #ffccc7",
  borderRadius: 8,
  fontSize: "0.9em",
} as const;

const INPUT_AREA_STYLE: CSS = {
  borderTop: `1px solid ${COLORS.GRAY_L}`,
  padding: "8px 12px",
} as const;

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
Run a cell by its 0-based index. The result will be reported once execution completes.
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
/*  Tool execution                                                     */
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

async function executeTool(
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
      const cellType = cell.get("cell_type") ?? "code";
      const input = cell.get("input") ?? "";
      const output = getCellOutput(cell);
      const state = cell.get("state") ?? null;
      return JSON.stringify({
        index: idx,
        id: cellId,
        cell_type: cellType,
        input: truncate(input),
        output: truncate(output),
        state,
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
      // Trigger execution — the result will be polled/awaited
      jupyterActions.run_cell(cellId, true);
      return JSON.stringify({
        status: "started",
        index: idx,
        id: cellId,
        note: "Cell execution started. The output will appear when done.",
      });
    }

    case "insert_cell": {
      const afterIdx = toolCall.args.after_index ?? -1;
      const content = toolCall.args.content ?? "";
      const cellType = toolCall.args.cell_type ?? "code";
      let newId: string;
      if (afterIdx < 0 || cellList.length === 0) {
        // Insert at the beginning
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
      const newIdx = newCellList.indexOf(newId);
      return JSON.stringify({
        status: "inserted",
        id: newId,
        index: newIdx,
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
      const content = toolCall.args.content ?? "";
      jupyterActions.set_cell_input(cellId, content, true);
      return JSON.stringify({ status: "updated", index: idx, id: cellId });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
  }
}

/* ------------------------------------------------------------------ */
/*  Sender ID helpers (for chat syncdb schema)                         */
/* ------------------------------------------------------------------ */

function agentSenderId(sender: "assistant" | "system"): string {
  return `notebook-agent-${sender}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface NotebookAgentProps {
  chatSyncdb: any; // the side chat syncdb
  jupyterActions: JupyterActions;
  project_id: string;
}

export function NotebookAgent({
  chatSyncdb,
  jupyterActions,
  project_id,
}: NotebookAgentProps) {
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const llmStreamRef = useRef<any>(null);

  const [syncdb, setSyncdb] = useState<any>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [allSessions, setAllSessions] = useState<string[]>([]);

  // Initialize syncdb from the chat syncdb
  useEffect(() => {
    if (!chatSyncdb) return;

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

  const loadSessionsAndMessages = useCallback(
    (db: any) => {
      if (db?.get_state() !== "ready") return;

      const allRecords = db.get();
      if (allRecords == null) return;

      const sessionsSet = new Set<string>();
      const msgsBySession = new Map<string, DisplayMessage[]>();

      allRecords.forEach((record: any) => {
        if (record.get("event") !== NOTEBOOK_AGENT_EVENT) return;
        const sid = record.get("session_id");
        if (!sid) return;
        sessionsSet.add(sid);

        if (!msgsBySession.has(sid)) {
          msgsBySession.set(sid, []);
        }

        msgsBySession.get(sid)!.push({
          sender: record.get("sender") ?? "user",
          content: record.get("content") ?? "",
          date: record.get("date") ?? "",
          event: record.get("msg_event") ?? "message",
          account_id: record.get("account_id"),
        });
      });

      const sessions = Array.from(sessionsSet).sort();
      setAllSessions(sessions);

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
    [sessionId],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (syncdb?.get_state() === "ready") {
      loadSessionsAndMessages(syncdb);
    }
  }, [sessionId, syncdb]);

  const handleNewSession = useCallback(() => {
    setSessionId(uuid());
    setMessages([]);
    setError("");
  }, []);

  const handleClearSession = useCallback(() => {
    if (!syncdb || !sessionId) return;
    const allRecords = syncdb.get();
    if (allRecords != null) {
      allRecords.forEach((record: any) => {
        if (
          record.get("event") === NOTEBOOK_AGENT_EVENT &&
          record.get("session_id") === sessionId
        ) {
          syncdb.delete({
            date: record.get("date"),
            sender_id: record.get("sender_id"),
            event: NOTEBOOK_AGENT_EVENT,
          });
        }
      });
      syncdb.commit();
    }
    setMessages([]);
  }, [syncdb, sessionId]);

  const writeMessage = useCallback(
    (msg: {
      date: string;
      sender: "user" | "assistant" | "system";
      content: string;
      account_id?: string;
      msg_event: string;
    }) => {
      if (!syncdb || syncdb.get_state() !== "ready") return;
      const sid = sessionId || uuid();

      syncdb.set({
        date: msg.date,
        sender_id:
          msg.sender === "user"
            ? (msg.account_id ?? "unknown")
            : agentSenderId(msg.sender),
        event: NOTEBOOK_AGENT_EVENT,
        session_id: sid,
        content: msg.content,
        sender: msg.sender,
        msg_event: msg.msg_event,
        account_id: msg.account_id,
      });
      syncdb.commit();
    },
    [syncdb, sessionId],
  );

  /** Run a single LLM turn. Returns the assistant response text. */
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
          if (cancelRef.current) {
            resolve(assistantContent);
            return;
          }
          if (token != null) {
            assistantContent += token;
            // Update the messages to show streaming
            setMessages((prev) => {
              const updated = [...prev];
              // Find or add the streaming assistant message
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
    [model, project_id],
  );

  const handleSubmit = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || generating) return;

    setError("");
    cancelRef.current = false;

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = uuid();
      setSessionId(activeSessionId);
    }

    const now = new Date().toISOString();
    const accountId =
      redux.getStore("account")?.get_account_id?.() ?? "unknown";

    writeMessage({
      date: now,
      sender: "user",
      content: prompt,
      account_id: accountId,
      msg_event: "message",
    });

    setInput("");
    setGenerating(true);

    try {
      const kernelName =
        jupyterActions.store?.getIn(["kernel_info", "display_name"]) ?? "";
      const language =
        jupyterActions.store?.getIn(["kernel_info", "language"]) ?? "";
      const system = buildSystemPrompt(
        kernelName as string,
        language as string,
      );

      // Build history from all messages (including tool results)
      const allMessages = messages.filter(
        (m) => m.sender === "user" || m.sender === "assistant",
      );
      let history = allMessages.map((m) => ({
        role: m.sender as "user" | "assistant",
        content: m.content,
      }));

      // Also include system/tool_result messages as "user" role so LLM sees tool output
      const toolResultMsgs = messages.filter((m) => m.event === "tool_result");
      for (const tr of toolResultMsgs) {
        history.push({
          role: "user" as const,
          content: `[Tool Result]\n${tr.content}`,
        });
      }

      // Re-sort by time to maintain order
      const msgWithTime = messages.map((m) => ({
        role:
          m.sender === "system"
            ? ("user" as const)
            : (m.sender as "user" | "assistant"),
        content:
          m.event === "tool_result" ? `[Tool Result]\n${m.content}` : m.content,
        date: m.date,
      }));
      msgWithTime.sort(
        (a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf(),
      );
      history = msgWithTime.map(({ role, content }) => ({ role, content }));

      let currentPrompt = prompt;
      let maxLoops = 10; // safety limit for tool-calling loops

      while (maxLoops > 0) {
        maxLoops--;

        const assistantText = await runLlmTurn(currentPrompt, history, system);
        if (cancelRef.current) break;

        const assistantDate = new Date().toISOString();
        writeMessage({
          date: assistantDate,
          sender: "assistant",
          content: assistantText,
          msg_event: "message",
        });

        // Parse tool calls
        const toolCalls = parseToolBlocks(assistantText);
        if (toolCalls.length === 0) {
          // No tools — done
          break;
        }

        // Execute all tool calls and collect results
        const results: string[] = [];
        for (const tc of toolCalls) {
          try {
            const result = await executeTool(tc, jupyterActions);
            results.push(`**${tc.name}**: ${result}`);
          } catch (err: any) {
            results.push(`**${tc.name}**: Error — ${err.message ?? err}`);
          }
        }

        const toolResultContent = results.join("\n\n");
        const toolDate = new Date().toISOString();
        writeMessage({
          date: toolDate,
          sender: "system",
          content: toolResultContent,
          msg_event: "tool_result",
        });

        // Add to history for next turn
        history.push({ role: "assistant", content: assistantText });
        history.push({
          role: "user",
          content: `[Tool Result]\n${toolResultContent}`,
        });

        // Continue the loop — ask LLM to process tool results
        currentPrompt = `Here are the tool results:\n\n${toolResultContent}\n\nContinue based on these results. If you need more information, use more tools. Otherwise, provide your answer.`;
      }
    } catch (err: any) {
      setError(err.message ?? `${err}`);
    } finally {
      setGenerating(false);
      llmStreamRef.current = null;
    }
  }, [
    input,
    messages,
    generating,
    model,
    project_id,
    sessionId,
    writeMessage,
    runLlmTurn,
    jupyterActions,
  ]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setGenerating(false);
    // The stream will naturally stop being processed due to cancelRef
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // allSessions is tracked for future session-switching UI
  void allSessions;

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
        <span style={{ fontWeight: 500 }}>Notebook Agent</span>
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
        <Tooltip title="Start a new conversation">
          <Button size="small" onClick={handleNewSession}>
            <Icon name="plus" /> New
          </Button>
        </Tooltip>
        {sessionId && messages.length > 0 && (
          <Popconfirm
            title="Clear all messages in this conversation?"
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
            Ask questions about your notebook, request changes, or ask the agent
            to run cells. (Ctrl+Enter to send)
          </Paragraph>
        )}
        {messages.map((msg, i) => (
          <div
            key={`${msg.date}-${i}`}
            style={
              msg.sender === "user"
                ? USER_MSG_STYLE
                : msg.sender === "system"
                  ? msg.content.includes("Error")
                    ? ERROR_MSG_STYLE
                    : SYSTEM_MSG_STYLE
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
            placeholder="Ask about your notebook... (Ctrl+Enter to send)"
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
      </div>
    </div>
  );
}
