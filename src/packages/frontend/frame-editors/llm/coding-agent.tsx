/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
An interactive coding agent frame panel.

The agent sees the current editor content and scroll position,
issues edits with user confirmation, and can trigger builds.
The first integration target is the LaTeX editor; Jupyter notebooks
are planned as the next step.
*/

import { Alert, Button, Input, Space, Spin, Tooltip } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import type { CSS } from "@cocalc/frontend/app-framework";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { EditorComponentProps } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COLORS } from "@cocalc/util/theme";
import LLMSelector from "./llm-selector";

const { TextArea } = Input;

interface Message {
  role: "user" | "assistant";
  content: string;
}

const TAG = "coding-agent";

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

const INPUT_AREA_STYLE: CSS = {
  borderTop: `1px solid ${COLORS.GRAY_L}`,
  padding: "8px 12px",
} as const;

/**
 * Gather context from the active CodeMirror frame in the same editor.
 * Returns the full document text plus the visible range (approximate first/last visible line).
 */
function getEditorContext(actions: any): {
  content: string;
  visibleRange?: { firstLine: number; lastLine: number };
  cursorLine?: number;
  selection?: string;
} {
  // Try to get the most recent CodeMirror instance from the editor
  const cm = actions._get_cm?.(undefined, true);
  if (cm == null) {
    // fallback: get content from sync string
    const content = actions._syncstring?.to_str?.() ?? "";
    return { content };
  }

  const content = cm.getValue();
  const selection = cm.getSelection();
  const cursor = cm.getCursor();

  // Get visible range from the viewport
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

/**
 * Build a system prompt that gives the agent awareness of the document context.
 */
function buildSystemPrompt(
  path: string,
  ctx: ReturnType<typeof getEditorContext>,
): string {
  const lines: string[] = [
    `You are a coding assistant embedded in a CoCalc editor.`,
    `The user is editing the file "${path}".`,
  ];

  if (ctx.visibleRange) {
    lines.push(
      `The editor viewport shows approximately lines ${ctx.visibleRange.firstLine + 1}–${ctx.visibleRange.lastLine + 1}.`,
    );
  }
  if (ctx.cursorLine != null) {
    lines.push(`The cursor is on line ${ctx.cursorLine + 1}.`);
  }
  if (ctx.selection) {
    lines.push(
      `The user has selected the following text:\n\`\`\`\n${ctx.selection}\n\`\`\``,
    );
  }

  lines.push("");
  lines.push("The full document content follows:");
  lines.push("```");
  lines.push(ctx.content);
  lines.push("```");
  lines.push("");
  lines.push(
    "When the user asks you to make changes, output the complete modified version of the relevant section " +
      "in a fenced code block. Explain what you changed and why. " +
      "Keep your responses concise and focused on the task.",
  );

  return lines.join("\n");
}

/**
 * Apply a code block from the assistant's response back to the editor.
 * Extracts the first fenced code block and replaces the editor content.
 */
function extractCodeBlock(text: string): string | undefined {
  const match = text.match(/```[\w]*\n([\s\S]*?)```/);
  return match?.[1];
}

export default function CodingAgent(_props: EditorComponentProps) {
  const { project_id, path, actions } = useFrameContext();
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>("");
  const [pendingCode, setPendingCode] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || generating) return;

    setError("");
    setPendingCode(undefined);
    cancelRef.current = false;

    const userMsg: Message = { role: "user", content: prompt };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setGenerating(true);

    try {
      // Gather context from the editor
      const ctx = getEditorContext(actions);

      const system = buildSystemPrompt(path, ctx);

      // Build history from prior conversation
      const history = newMessages.slice(0, -1).map((m) => ({
        role: m.role as "user" | "assistant",
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

      llmStream.on("token", (token: string | null) => {
        if (cancelRef.current) return;
        if (token != null) {
          assistantContent += token;
          setMessages([
            ...newMessages,
            { role: "assistant", content: assistantContent },
          ]);
        } else {
          // Stream ended (token === null)
          setGenerating(false);
          // Check if the response contains a code block for potential application
          const code = extractCodeBlock(assistantContent);
          if (code) {
            setPendingCode(code);
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
  }, [input, messages, generating, actions, path, model, project_id]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setGenerating(false);
  }, []);

  const handleApplyCode = useCallback(() => {
    if (!pendingCode) return;

    const cm = actions._get_cm?.(undefined, true);
    if (cm) {
      const selection = cm.getSelection();
      if (selection) {
        // Replace selection
        cm.replaceSelection(pendingCode);
      } else {
        // Replace full document
        cm.setValue(pendingCode);
      }
    } else {
      // Fallback: use syncstring
      actions._syncstring?.from_str?.(pendingCode);
    }
    setPendingCode(undefined);
  }, [pendingCode, actions]);

  const handleBuild = useCallback(() => {
    actions.build?.();
  }, [actions]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

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

      {/* Messages */}
      <div style={MESSAGES_STYLE}>
        {messages.length === 0 && (
          <Paragraph
            style={{ color: COLORS.GRAY_M, textAlign: "center", marginTop: 20 }}
          >
            Ask the agent to help with your document. It can see the editor
            content, suggest changes, and trigger builds.
          </Paragraph>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={msg.role === "user" ? USER_MSG_STYLE : ASSISTANT_MSG_STYLE}
          >
            {msg.role === "assistant" ? (
              <StaticMarkdown value={msg.content} />
            ) : (
              msg.content
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

      {/* Action bar for pending code */}
      {pendingCode && (
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${COLORS.GRAY_L}`,
            background: COLORS.GRAY_LLL,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="check" />
          <span>The agent suggests code changes.</span>
          <Button size="small" type="primary" onClick={handleApplyCode}>
            Apply to Editor
          </Button>
          <Button size="small" onClick={() => setPendingCode(undefined)}>
            Dismiss
          </Button>
          {actions.build && (
            <Tooltip title="Apply changes and trigger a build">
              <Button
                size="small"
                onClick={() => {
                  handleApplyCode();
                  // Small delay to let the edit propagate
                  setTimeout(() => handleBuild(), 500);
                }}
              >
                <Icon name="play" /> Apply & Build
              </Button>
            </Tooltip>
          )}
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
            placeholder="Ask the coding agent... (Ctrl+Enter to send)"
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
          {actions.build && (
            <Button size="small" onClick={handleBuild}>
              <Icon name="play" /> Build
            </Button>
          )}
          <Button
            size="small"
            onClick={() => {
              setMessages([]);
              setPendingCode(undefined);
              setError("");
            }}
          >
            <Icon name="trash" /> Clear Chat
          </Button>
        </div>
      </div>
    </div>
  );
}
