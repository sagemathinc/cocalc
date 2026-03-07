/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Agent conversation panel for the .ai editor.

The user talks to the agent which creates an application in the
hidden app directory.  The agent can create/modify files and the
result is shown in the AppPreview panel on the right.
*/

import {
  Alert,
  Button,
  Input,
  Popconfirm,
  Select,
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
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_split, uuid } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { EditorComponentProps } from "../frame-tree/types";
import { appDir } from "./app-preview";
import LLMSelector from "../llm/llm-selector";

const { TextArea } = Input;

interface DisplayMessage {
  sender: "user" | "assistant" | "system";
  content: string;
  date: string;
  event: string;
  account_id?: string;
}

const TAG = "ai-agent";

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

const INPUT_AREA_STYLE: CSS = {
  borderTop: `1px solid ${COLORS.GRAY_L}`,
  padding: "8px 12px",
} as const;

/**
 * Build a system prompt for the app-building agent.
 */
function buildSystemPrompt(appDirectory: string): string {
  return `You are an AI app-building agent in CoCalc.
The user describes an application they want. You create it by writing files.

The app files go in the directory: ${appDirectory}/
The entry point must be: ${appDirectory}/index.html

You can create HTML, CSS, JavaScript, and Python files.
Python files in the app directory serve as backend logic and can be run in the CoCalc project.

When you want to create or modify a file, use this format:

\`\`\`writefile ${appDirectory}/filename.ext
file contents here
\`\`\`

You can include multiple writefile blocks in one response.
After writing files, the app preview will automatically reload.

When you need to run a shell command (e.g., install a package, run a Python script), use:

\`\`\`exec
command here
\`\`\`

The user will be asked to confirm before execution.

Keep responses concise and focused. Build incrementally — start simple, then enhance.`;
}

/**
 * Parse writefile blocks from LLM response.
 */
interface WriteFileBlock {
  path: string;
  content: string;
}

function parseWriteFileBlocks(text: string): WriteFileBlock[] {
  const blocks: WriteFileBlock[] = [];
  const regex = /```writefile\s+(\S+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      path: match[1],
      content: match[2],
    });
  }
  return blocks;
}

/**
 * Parse exec blocks from LLM response.
 */
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

export default function AgentPanel(_props: EditorComponentProps) {
  const { project_id, path, actions } = useFrameContext();
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>("");
  const [pendingWrites, setPendingWrites] = useState<WriteFileBlock[]>([]);
  const [pendingExec, setPendingExec] = useState<ExecBlock[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);

  const dir = appDir(path);

  // SyncDB state — piggybacks on the frame editor's syncdb (the .ai file).
  const [syncdb, setSyncdb] = useState<any>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [allSessions, setAllSessions] = useState<string[]>([]);

  // Get the syncdb from the actions (the .ai file's syncdb)
  useEffect(() => {
    const db = (actions as any)._syncstring;
    if (db == null) return;

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

    return () => {
      db.removeListener("change", handleChange);
    };
  }, [actions]);

  const loadSessionsAndMessages = useCallback(
    (db: any) => {
      if (db?.get_state() !== "ready") return;

      const allRecords = db.get();
      if (allRecords == null) return;

      const sessionsSet = new Set<string>();
      const msgsBySession = new Map<string, DisplayMessage[]>();

      allRecords.forEach((record: any) => {
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
          event: record.get("event") ?? "message",
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
    const newId = uuid();
    setSessionId(newId);
    setMessages([]);
    setPendingWrites([]);
    setPendingExec([]);
    setError("");
  }, []);

  const handleClearSession = useCallback(() => {
    if (!syncdb || !sessionId) return;
    const allRecords = syncdb.get();
    if (allRecords != null) {
      allRecords.forEach((record: any) => {
        if (record.get("session_id") === sessionId) {
          syncdb.delete({
            session_id: sessionId,
            date: record.get("date"),
          });
        }
      });
      syncdb.commit();
    }
    setMessages([]);
    setPendingWrites([]);
    setPendingExec([]);
  }, [syncdb, sessionId]);

  const writeMessage = useCallback(
    (msg: {
      date: string;
      sender: "user" | "assistant" | "system";
      content: string;
      account_id?: string;
      event: string;
    }) => {
      if (!syncdb || syncdb.get_state() !== "ready") return;
      const sid = sessionId || uuid();

      syncdb.set({
        session_id: sid,
        date: msg.date,
        sender: msg.sender,
        content: msg.content,
        account_id: msg.account_id,
        event: msg.event,
      });
      syncdb.commit();
    },
    [syncdb, sessionId],
  );

  const applyWriteFiles = useCallback(
    async (blocks: WriteFileBlock[]) => {
      for (const block of blocks) {
        try {
          await webapp_client.project_client.writeFile({
            project_id,
            path: block.path,
            content: block.content,
          });
        } catch (err: any) {
          const now = new Date().toISOString();
          writeMessage({
            date: now,
            sender: "system",
            content: `Error writing \`${block.path}\`: ${err.message ?? err}`,
            event: "exec_result",
          });
        }
      }
      // Trigger app preview reload
      (actions as any).reloadAppPreview?.();
      setPendingWrites([]);

      const now = new Date().toISOString();
      const fileList = blocks.map((b) => `\`${b.path}\``).join(", ");
      writeMessage({
        date: now,
        sender: "system",
        content: `Wrote ${blocks.length} file(s): ${fileList}`,
        event: "exec_result",
      });
    },
    [project_id, actions, writeMessage],
  );

  const handleSubmit = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || generating) return;

    setError("");
    setPendingWrites([]);
    setPendingExec([]);
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
      event: "message",
    });

    setInput("");
    setGenerating(true);

    try {
      const system = buildSystemPrompt(dir);

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
          setGenerating(false);

          const assistantDate = new Date().toISOString();
          writeMessage({
            date: assistantDate,
            sender: "assistant",
            content: assistantContent,
            event: "message",
          });

          // Check for writefile blocks and auto-apply them
          const writeBlocks = parseWriteFileBlocks(assistantContent);
          if (writeBlocks.length > 0) {
            setPendingWrites(writeBlocks);
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
    dir,
    model,
    project_id,
    sessionId,
    writeMessage,
  ]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setGenerating(false);
  }, []);

  const handleExecCommand = useCallback(
    async (command: string) => {
      const execDir = path_split(path).head || ".";
      try {
        const result = await exec(
          {
            project_id,
            command: "/bin/bash",
            args: ["-c", command],
            timeout: 60,
            max_output: 100000,
            bash: false,
            path: execDir,
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
          event: "exec_result",
        });
      } catch (err: any) {
        const now = new Date().toISOString();
        writeMessage({
          date: now,
          sender: "system",
          content: `Error executing \`${command}\`: ${err.message ?? err}`,
          event: "exec_result",
        });
      }
      setPendingExec((prev) => prev.filter((e) => e.command !== command));
    },
    [project_id, path, writeMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const sessionOptions = useMemo(() => {
    return allSessions.map((sid, i) => ({
      value: sid,
      label: `Session ${i + 1}`,
    }));
  }, [allSessions]);

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
        <span style={{ fontWeight: 500 }}>App Agent</span>
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
        {allSessions.length > 1 && (
          <Select
            size="small"
            style={{ minWidth: 120 }}
            value={sessionId}
            onChange={setSessionId}
            options={sessionOptions}
          />
        )}
        <Tooltip title="Start a new conversation session">
          <Button size="small" onClick={handleNewSession}>
            <Icon name="plus" /> New
          </Button>
        </Tooltip>
        {sessionId && messages.length > 0 && (
          <Popconfirm
            title="Clear all messages in this session?"
            onConfirm={handleClearSession}
            okText="Clear"
            cancelText="Cancel"
          >
            <Button size="small" danger>
              <Icon name="trash" /> Clear
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
            Describe the application you want to build. The agent will create
            files and the result will appear in the App preview on the right.
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

      {/* Pending writes action bar */}
      {pendingWrites.length > 0 && (
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
          <Icon name="file" />
          <span>{pendingWrites.length} file(s) to write.</span>
          <Button
            size="small"
            type="primary"
            onClick={() => applyWriteFiles(pendingWrites)}
          >
            <Icon name="check" /> Apply
          </Button>
          <Button size="small" onClick={() => setPendingWrites([])}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Pending exec commands */}
      {pendingExec.length > 0 && (
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${COLORS.GRAY_L}`,
            background: "#fffbe6",
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
            placeholder="Describe the app you want... (Ctrl+Enter to send)"
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
