/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Coding agent frame panel — an LLM-powered assistant for code files.

Uses the shared agent-base hook and UI components for session/SyncDB
management.  This file contains only coding-agent-specific logic:
- Editor context extraction and system prompt building
- Edit block parsing, applying, and diff formatting
- Shell command execution
- Cost estimation
- <<<SHOW block auto-fulfillment
*/

import { Button, Popconfirm, Tooltip } from "antd";
import { useCallback, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { LLMCostEstimationChat } from "@cocalc/frontend/chat/llm-cost-estimation";
import type { CostEstimate } from "@cocalc/frontend/chat/types";
import { Icon } from "@cocalc/frontend/components";
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
import { path_split, trunc, uuid } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import {
  AgentErrorBoundary,
  AgentHeader,
  AgentInputArea,
  AgentMessages,
  AgentSessionBar,
  CONTAINER_STYLE,
  useAgentSession,
} from "./agent-base";
import type { DisplayMessage } from "./agent-base";
import { CollapsibleDiffs, RenameModal } from "./coding-agent-components";
import type { EditBlock, ExecBlock, SearchReplace } from "./coding-agent-types";
import { DIFF_MAX_HEIGHT, TAG } from "./coding-agent-types";
import {
  applyEditBlocks,
  applySearchReplace,
  buildSystemPrompt,
  extractCodeBlock,
  formatEditBlocksAsDiff,
  formatSearchReplaceAsDiff,
  fulfillShowBlocks,
  getEditorContent,
  getEditorContext,
  parseEditBlocks,
  parseExecBlocks,
  parseSearchReplaceBlocks,
  parseShowBlocks,
  SHOW_BLOCK_REGEX,
  truncateMiddle,
} from "./coding-agent-utils";

/* ------------------------------------------------------------------ */
/*  Main component — standalone frame wrapper                          */
/* ------------------------------------------------------------------ */

export default function CodingAgent(_props: EditorComponentProps) {
  return (
    <AgentErrorBoundary>
      <CodingAgentCore />
    </AgentErrorBoundary>
  );
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
  return (
    <AgentErrorBoundary>
      <CodingAgentCore chatSyncdb={chatSyncdb} />
    </AgentErrorBoundary>
  );
}

/* ------------------------------------------------------------------ */
/*  Core component                                                     */
/* ------------------------------------------------------------------ */

function CodingAgentCore({ chatSyncdb }: { chatSyncdb?: any } = {}) {
  const { project_id, path, actions } = useFrameContext();
  const [model, setModel] = useLanguageModelSetting(project_id);
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
  const llm_markup = useTypedRedux("customize", "llm_markup");

  // ---- Shared session management ----
  const session = useAgentSession({
    chatSyncdb,
    eventName: "coding-agent",
    project_id,
    path,
    supportSessionNames: true,
  });

  // ---- Coding-agent-specific state ----
  const [input, setInput] = useState("");
  const [costEstimate, setCostEstimate] = useState<CostEstimate>(null);
  const [pendingEdits, setPendingEdits] = useState<
    | { type: "edit_blocks"; blocks: EditBlock[]; base: string }
    | { type: "search_replace"; blocks: SearchReplace[]; base: string }
    | { type: "full_replace"; code: string; base: string }
    | undefined
  >();
  const [pendingExec, setPendingExec] = useState<ExecBlock[]>([]);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  // Tracks whether edits have been applied in this turn — highlights the
  // Done button to encourage the user to close the turn and save tokens.
  // Reset when the session (turn) changes (e.g. user clicks Done).
  const [editsApplied, setEditsApplied] = useState(false);
  const prevSessionIdRef = useRef(session.sessionId);
  if (prevSessionIdRef.current !== session.sessionId) {
    prevSessionIdRef.current = session.sessionId;
    if (editsApplied) setEditsApplied(false);
  }

  // Ref to always call the latest handleSubmit so auto-continuation
  // (e.g. <<<SHOW fulfillment) avoids stale closures.
  const handleSubmitRef = useRef<(directInput?: string) => Promise<void>>(
    async () => {},
  );

  // Active LLM stream ref — allows cancel to stop processing tokens.
  const streamRef = useRef<{ removeAllListeners: () => void } | null>(null);

  // ---- Editor context indicator ----
  // Snapshot taken when the input area receives focus — this is the
  // context the LLM will receive.  No last-second re-read on send;
  // the user sees exactly what gets sent.
  const editorContextRef = useRef<ReturnType<typeof getEditorContext> | null>(
    null,
  );
  const [editorContextLabel, setEditorContextLabel] = useState("");
  const updateEditorContext = useCallback(() => {
    const ctx = getEditorContext(actions);
    editorContextRef.current = ctx;
    let label = "";
    if (ctx.cursorLine != null) {
      if (ctx.selection && ctx.selectionRange) {
        const { fromLine, toLine } = ctx.selectionRange;
        if (fromLine === toLine) {
          // Single-line partial selection — show the verbatim text
          label = `Line ${fromLine + 1}: "${trunc(ctx.selection, 60)}"`;
        } else {
          label = `Lines ${fromLine + 1}–${toLine + 1} selected`;
        }
      } else {
        label = `Cursor at line ${ctx.cursorLine + 1}`;
      }
    }
    setEditorContextLabel(label);
  }, [actions]);

  // ---- Cost estimation ----
  const estimateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      if (!value.trim()) {
        if (estimateTimeoutRef.current) {
          clearTimeout(estimateTimeoutRef.current);
        }
        setCostEstimate(null);
        return;
      }
      if (estimateTimeoutRef.current) {
        clearTimeout(estimateTimeoutRef.current);
      }
      estimateTimeoutRef.current = setTimeout(async () => {
        if (!model) {
          setCostEstimate(null);
          return;
        }
        if (isFreeModel(model, isCoCalcCom)) {
          setCostEstimate({ min: 0, max: 0 });
          return;
        }
        const { numTokensEstimate } = await import("@cocalc/frontend/misc/llm");
        const currentMessages = session.messages.filter(
          (m) => m.event === "message",
        );
        const historyText = currentMessages.map((m) => m.content).join("\n");
        const tokens = numTokensEstimate([historyText, value].join("\n"));
        const est = calcMinMaxEstimation(tokens, model, llm_markup);
        setCostEstimate(est);
      }, 500);
    },
    [model, isCoCalcCom, llm_markup, session.messages],
  );

  // ---- Auto-name session (user-triggered via magic wand button) ----
  const autoNameSession = useCallback(async () => {
    const sid = session.sessionId;
    if (!sid || session.messages.length === 0) return;
    try {
      // Gather the first ~1000 characters from user + assistant messages
      let context = "";
      for (const msg of session.messages) {
        if (msg.sender === "user" || msg.sender === "assistant") {
          context += `${msg.sender === "user" ? "User" : "Assistant"}: ${msg.content}\n\n`;
          if (context.length >= 1000) break;
        }
      }
      context = context.slice(0, 1000);

      // Use a free model on cocalc.com to avoid charging the user for
      // naming; fall back to their selected model if none is available.
      const freeModel = isCoCalcCom ? getOneFreeModel() : undefined;
      const nameModel =
        freeModel && isFreeModel(freeModel, isCoCalcCom) ? freeModel : model;
      const stream = webapp_client.openai_client.queryStream({
        input: `Given this conversation between a user and a coding assistant, generate a very short descriptive title (at most 7 words). Reply with ONLY the title, no quotes, no punctuation at the end.\n\n${context}`,
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
          const trimmed = title.trim().slice(0, 80);
          if (trimmed) {
            session.writeSessionName(trimmed, sid);
          }
        }
      });
      stream.on("error", () => {});
    } catch {
      // Silently ignore — naming is best-effort
    }
  }, [
    isCoCalcCom,
    model,
    project_id,
    session.sessionId,
    session.messages,
    session.writeSessionName,
  ]);

  // ---- Submit handler ----
  const handleSubmit = useCallback(
    async (directInput?: string) => {
      const prompt = (directInput ?? input).trim();
      if (!prompt || session.generating) return;

      setPendingEdits(undefined);
      setPendingExec([]);
      setEditsApplied(false);
      session.cancelRef.current = false;

      let activeSessionId = session.sessionId;
      if (!activeSessionId) {
        activeSessionId = uuid();
        session.setSessionId(activeSessionId);
      }

      // Use the context snapshot from when the input was focused —
      // what the user saw is what the LLM gets.  Fall back to a fresh
      // read if no snapshot exists (e.g. first message, auto-continuation).
      const ctx = editorContextRef.current ?? getEditorContext(actions);
      const baseSnapshot = ctx.content;

      const now = new Date().toISOString();
      const accountId =
        redux.getStore("account")?.get_account_id?.() ?? "unknown";

      session.writeMessage({
        date: now,
        sender: "user",
        content: prompt,
        account_id: accountId,
        msg_event: "message",
        base_snapshot: baseSnapshot,
        session_id: activeSessionId,
      });

      setInput("");
      session.setGenerating(true);

      try {
        const hasBuild = typeof actions.build === "function";
        const system = buildSystemPrompt(path, ctx, hasBuild);

        // Include conversation messages plus exec results and show_lines
        // responses — the LLM needs to see command output and requested
        // document lines to reason about them.  Error events are excluded
        // (internal UI state, not part of the logical conversation).
        const HISTORY_EVENTS = new Set([
          "message",
          "exec_result",
          "show_lines",
        ]);
        const currentMessages = session.messages.filter((m) =>
          HISTORY_EVENTS.has(m.event),
        );
        const history = currentMessages.map((m) => ({
          role: (m.sender === "assistant" ? "assistant" : "user") as
            | "user"
            | "assistant",
          content: truncateMiddle(m.content),
        }));

        const llmStream = webapp_client.openai_client.queryStream({
          input: prompt,
          system,
          history,
          model,
          project_id,
          tag: TAG,
        });
        streamRef.current = llmStream;

        let assistantContent = "";
        // Build the streaming array once: history + user msg + mutable
        // assistant placeholder.  On each token we mutate the placeholder's
        // content and create a shallow copy of the array (O(1) per element)
        // instead of re-spreading the full history every time (was O(N)).
        const assistantMsg: DisplayMessage = {
          sender: "assistant",
          content: "",
          date: "",
          event: "message",
        };
        const streamingMsgs = [
          ...session.messages,
          {
            sender: "user" as const,
            content: prompt,
            date: now,
            event: "message",
            account_id: accountId,
          },
          assistantMsg,
        ];

        llmStream.on("token", (token: string | null) => {
          if (session.cancelRef.current) {
            // Stop processing and detach all listeners so the stream
            // callback is not invoked for remaining tokens.
            llmStream.removeAllListeners();
            streamRef.current = null;
            return;
          }
          if (token != null) {
            assistantContent += token;
            assistantMsg.content = assistantContent;
            // Shallow copy triggers React re-render without reallocating
            // every element — the array structure is already built.
            session.setMessages([...streamingMsgs]);
          } else {
            // Stream ended
            session.setGenerating(false);

            const assistantDate = new Date().toISOString();
            session.writeMessage({
              date: assistantDate,
              sender: "assistant",
              content: assistantContent,
              msg_event: "message",
              session_id: activeSessionId,
            });

            // Check for edit blocks
            const editBlocks = parseEditBlocks(assistantContent);
            if (editBlocks.length > 0) {
              setPendingEdits({
                type: "edit_blocks",
                blocks: editBlocks,
                base: baseSnapshot,
              });
            } else {
              const srBlocks = parseSearchReplaceBlocks(assistantContent);
              if (srBlocks.length > 0) {
                setPendingEdits({
                  type: "search_replace",
                  blocks: srBlocks,
                  base: baseSnapshot,
                });
              } else {
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

            // Check for <<<SHOW blocks
            const showBlocks = parseShowBlocks(assistantContent);
            const lang = path.split(".").pop() ?? "";
            const showResponse = fulfillShowBlocks(
              showBlocks,
              getEditorContent(actions),
              undefined,
              lang,
            );
            if (showResponse) {
              const showDate = new Date().toISOString();
              session.writeMessage({
                date: showDate,
                sender: "system",
                content: showResponse,
                msg_event: "show_lines",
                session_id: activeSessionId,
              });
              setTimeout(() => {
                handleSubmitRef.current(
                  "Here are the lines you requested. Continue with your task.",
                );
              }, 100);
            }

            // Check for command blocks
            const execBlocks = parseExecBlocks(assistantContent);
            if (execBlocks.length > 0) {
              setPendingExec(execBlocks);
            }

            // Session naming is user-triggered via the magic wand button
            // in the session bar — no automatic LLM calls.
          }
        });

        llmStream.on("error", (err: Error) => {
          session.writeMessage({
            date: new Date().toISOString(),
            sender: "system",
            content: `Error: ${err.message ?? err}`,
            msg_event: "error",
          });
          session.setGenerating(false);
        });
      } catch (err: any) {
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Error: ${err.message ?? err}`,
          msg_event: "error",
        });
        session.setGenerating(false);
      }
    },
    [
      input,
      session.messages,
      session.generating,
      session.sessionId,
      actions,
      path,
      model,
      project_id,
      session.writeMessage,
      session.setGenerating,
      session.setMessages,
      session.setSessionId,
    ],
  );
  handleSubmitRef.current = handleSubmit;

  // ---- Apply edits ----
  const handleApplyEdits = useCallback(() => {
    if (!pendingEdits) return;

    const currentContent = getEditorContent(actions);

    let newContent: string;
    if (pendingEdits.type === "edit_blocks") {
      const {
        result: modified,
        applied,
        failed,
      } = applyEditBlocks(pendingEdits.base, pendingEdits.blocks);

      if (applied === 0) {
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Error: Could not apply edits — none of the ${failed} edit block(s) had valid line ranges.`,
          msg_event: "error",
        });
        setPendingEdits(undefined);
        return;
      }
      if (failed > 0) {
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Warning: Applied ${applied} edit(s), but ${failed} had invalid line ranges.`,
          msg_event: "error",
        });
      }

      newContent = three_way_merge({
        base: pendingEdits.base,
        local: currentContent,
        remote: modified,
      });
    } else if (pendingEdits.type === "search_replace") {
      const {
        result: modified,
        applied,
        failed,
      } = applySearchReplace(pendingEdits.base, pendingEdits.blocks);

      if (applied === 0) {
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Error: Could not apply edits — none of the ${failed} search block(s) matched the document.`,
          msg_event: "error",
        });
        setPendingEdits(undefined);
        return;
      }
      if (failed > 0) {
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Warning: Applied ${applied} edit(s), but ${failed} search block(s) did not match.`,
          msg_event: "error",
        });
      }

      newContent = three_way_merge({
        base: pendingEdits.base,
        local: currentContent,
        remote: modified,
      });
    } else {
      newContent = three_way_merge({
        base: pendingEdits.base,
        local: currentContent,
        remote: pendingEdits.code,
      });
    }

    try {
      actions.set_value(newContent);
      setEditsApplied(true);
    } catch (err) {
      session.writeMessage({
        date: new Date().toISOString(),
        sender: "system",
        content: `Error: Failed to apply edits — ${err}`,
        msg_event: "error",
      });
    }
    setPendingEdits(undefined);
  }, [pendingEdits, actions, session.writeMessage]);

  // ---- Exec command ----
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

        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Ran: \`${command}\`\n\n${output}`,
          msg_event: "exec_result",
        });
      } catch (err: any) {
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Error running \`${command}\`: ${err.message ?? err}`,
          msg_event: "exec_result",
        });
      }
      setPendingExec((prev) => prev.filter((e) => e.command !== command));
    },
    [project_id, path, session.writeMessage],
  );

  const handleBuild = useCallback(() => {
    actions.build?.();
  }, [actions]);

  const hasBuild = typeof actions.build === "function";

  // ---- Message renderer ----
  const renderMessage = useCallback(
    (msg: DisplayMessage, i: number) => {
      if (msg.sender === "user") {
        return <StaticMarkdown value={msg.content} />;
      }
      if (msg.sender === "assistant") {
        let renderedContent = msg.content;
        // Find base snapshot from preceding user message
        let baseSnapshot = "";
        for (let j = i - 1; j >= 0; j--) {
          if (
            session.messages[j].sender === "user" &&
            session.messages[j].base_snapshot
          ) {
            baseSnapshot = session.messages[j].base_snapshot!;
            break;
          }
        }
        // Strip <<<SHOW blocks
        renderedContent = renderedContent.replace(SHOW_BLOCK_REGEX, "").trim();
        // Format edit blocks as diffs
        if (parseEditBlocks(renderedContent).length > 0 && baseSnapshot) {
          renderedContent = formatEditBlocksAsDiff(
            renderedContent,
            baseSnapshot,
          );
        } else {
          renderedContent = formatSearchReplaceAsDiff(renderedContent);
        }
        return (
          <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
            <CollapsibleDiffs>
              <StaticMarkdown value={renderedContent} />
            </CollapsibleDiffs>
          </FileContext.Provider>
        );
      }
      // system — show_lines: plain syntax-highlighted code, no toolbar
      if (msg.event === "show_lines") {
        return (
          <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
            <CollapsibleDiffs maxHeight={DIFF_MAX_HEIGHT}>
              <StaticMarkdown value={msg.content} />
            </CollapsibleDiffs>
          </FileContext.Provider>
        );
      }
      return <StaticMarkdown value={msg.content} />;
    },
    [session.messages],
  );

  // ---- Render ----
  return (
    <div style={CONTAINER_STYLE}>
      <AgentHeader
        title="Coding Agent"
        model={model}
        setModel={setModel}
        project_id={project_id}
      />

      <AgentSessionBar
        session={session}
        onAutoName={autoNameSession}
        onRename={() => setRenameModalOpen(true)}
        extraButtons={
          hasBuild ? (
            <Button size="small" onClick={handleBuild}>
              <Icon name="play" /> Build
            </Button>
          ) : undefined
        }
      />

      <AgentMessages
        session={session}
        renderMessage={renderMessage}
        emptyText="Ask the agent to help with your document. It can see the editor content, suggest edits, run shell commands, and trigger builds."
      />

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
            <Icon name="terminal" /> Commands to run:
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

      {/* Editor context indicator — shows cursor/selection so the user
           knows what the LLM will "see" from the editor */}
      {editorContextLabel && (
        <div
          style={{
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
        sendDisabled={!input.trim()}
        showDone
        doneHighlight={editsApplied}
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
      >
        <div
          onFocus={updateEditorContext}
          onBlur={(e) => {
            // Only clear when focus leaves the entire input area,
            // not when moving between children (e.g. textarea → toolbar).
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setEditorContextLabel("");
            }
          }}
        >
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
