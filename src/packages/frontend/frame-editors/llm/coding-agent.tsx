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

import { Button, Tooltip } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

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
import { isFreeModel } from "@cocalc/util/db-schema/llm-utils";
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
  RenameModal,
  useAgentSession,
  useAutoNameSession,
} from "./agent-base";
import type { DisplayMessage } from "./agent-base";
import { CollapsibleDiffs } from "./coding-agent-components";
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
  });

  // ---- Coding-agent-specific state ----
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0);
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
  // SHOW auto-continuation timer — cleared on unmount/cancel/session switch
  // to prevent stale callbacks firing into the wrong session.
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSessionIdRef = useRef(session.sessionId);
  if (prevSessionIdRef.current !== session.sessionId) {
    prevSessionIdRef.current = session.sessionId;
    if (editsApplied) setEditsApplied(false);
    // Clear stale pending state from the previous session — otherwise
    // the "Apply to Editor" and "Commands to run" bars stay visible
    // and would act on the wrong session's context.
    if (pendingEdits) setPendingEdits(undefined);
    if (pendingExec.length > 0) setPendingExec([]);
    // Cancel any pending SHOW auto-continuation — it belongs to the
    // previous session and must not fire into the new one.
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }

  // Ref to always call the latest handleSubmit so auto-continuation
  // (e.g. <<<SHOW fulfillment) avoids stale closures.
  const handleSubmitRef = useRef<(directInput?: string) => Promise<void>>(
    async () => {},
  );

  // Stores the last submitted prompt so Stop can restore it.
  const lastSubmittedRef = useRef("");
  const inputLockedRef = useRef(false);

  // Active LLM stream ref — allows cancel to stop processing tokens.
  const streamRef = useRef<{
    removeAllListeners: () => void;
    on: (event: string, handler: (...args: any[]) => void) => void;
  } | null>(null);

  // ---- Cleanup on unmount ----
  // Clear pending timers and detach any active stream so callbacks
  // don't fire on unmounted component state.
  useEffect(() => {
    return () => {
      if (estimateTimeoutRef.current) {
        clearTimeout(estimateTimeoutRef.current);
      }
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }
      const stream = streamRef.current;
      if (stream) {
        stream.removeAllListeners();
        // Keep a no-op error handler so late transport/auth errors
        // don't become uncaught EventEmitter exceptions.
        stream.on("error", () => {});
        streamRef.current = null;
      }
    };
  }, []);

  // ---- Editor context indicator ----
  // Snapshot taken when the input area receives focus — this is the
  // context the LLM will receive.  No last-second re-read on send;
  // the user sees exactly what gets sent.
  const editorContextRef = useRef<ReturnType<typeof getEditorContext> | null>(
    null,
  );
  const [editorContextLabel, setEditorContextLabel] = useState("");
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  // Clear context label when focus moves anywhere outside the input area.
  // This catches cross-frame focus changes (e.g., clicking CodeMirror)
  // that don't fire React's onBlur on the wrapper div.
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      if (
        inputWrapperRef.current &&
        !inputWrapperRef.current.contains(e.target as Node)
      ) {
        setEditorContextLabel("");
      }
    };
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  const updateEditorContext = useCallback(() => {
    const ctx = getEditorContext(actions);
    editorContextRef.current = ctx;
    const filename = trunc(path.split("/").pop() ?? path, 30);
    let label = "";
    if (ctx.cursorLine != null) {
      if (ctx.selection && ctx.selectionRange) {
        const { fromLine, toLine } = ctx.selectionRange;
        if (fromLine === toLine) {
          // Single-line partial selection — show the verbatim text
          label = `Line ${fromLine + 1} of ${filename}: "${trunc(ctx.selection, 60)}"`;
        } else {
          label = `Lines ${fromLine + 1}–${toLine + 1} of ${filename} selected`;
        }
      } else {
        label = `Cursor at line ${ctx.cursorLine + 1} of ${filename}`;
      }
    }
    setEditorContextLabel(label);
  }, [actions, path]);

  // ---- Cost estimation ----
  const estimateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = useCallback(
    (value: string) => {
      if (inputLockedRef.current) return;
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
        try {
          const { numTokensEstimate } =
            await import("@cocalc/frontend/misc/llm");
          const currentMessages = session.messages.filter(
            (m) => m.event === "message",
          );
          const historyText = currentMessages.map((m) => m.content).join("\n");
          const tokens = numTokensEstimate([historyText, value].join("\n"));
          const est = calcMinMaxEstimation(tokens, model, llm_markup);
          setCostEstimate(est);
        } catch {
          // Unknown model or cost lookup failure — skip estimation
          setCostEstimate(null);
        }
      }, 500);
    },
    [model, isCoCalcCom, llm_markup, session.messages],
  );

  const autoNameSession = useAutoNameSession({
    session,
    model,
    project_id,
    tag: TAG,
  });

  // ---- Submit handler ----
  const handleSubmit = useCallback(
    async (directInput?: string) => {
      const prompt = (directInput ?? input).trim();
      // Use the ref (not React state) to avoid the batching window where
      // `session.generating` is still false even though we've started.
      if (!prompt || session.generatingRef.current) return;

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

      lastSubmittedRef.current = prompt;
      inputLockedRef.current = true;
      setInput("");
      setInputKey((k) => k + 1);
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
            // Stop processing and detach listeners so no more tokens
            // are handled.  Keep a no-op error handler for safety.
            llmStream.removeAllListeners();
            llmStream.on("error", () => {});
            streamRef.current = null;
            return;
          }
          if (token != null) {
            assistantContent += token;
            assistantMsg.content = assistantContent;
            // Don't update messages if the user switched sessions mid-stream —
            // the streaming array belongs to the old session and would overwrite
            // the newly selected session's messages on every token.
            if (session.sessionIdRef.current !== activeSessionId) return;
            // Shallow copy triggers React re-render without reallocating
            // every element — the array structure is already built.
            session.setMessages([...streamingMsgs]);
          } else {
            // Stream ended — always persist the message, but only
            // apply UI state (generating, pendingEdits) if the user
            // hasn't switched to a different session mid-stream.
            inputLockedRef.current = false;
            session.setGenerating(false);
            streamRef.current = null;

            const sessionChanged =
              session.sessionIdRef.current !== activeSessionId;

            const assistantDate = new Date().toISOString();
            session.writeMessage({
              date: assistantDate,
              sender: "assistant",
              content: assistantContent,
              msg_event: "message",
              session_id: activeSessionId,
            });

            // Only apply UI state if the session hasn't changed
            // mid-stream (e.g. user clicked "New Turn" while streaming).
            if (!sessionChanged) {
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
                path.split("/").pop() ?? path,
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
                // Check for command blocks BEFORE scheduling auto-
                // continuation — if exec blocks exist, the user needs
                // to run them first, so we don't auto-continue.
                const execBlocks = parseExecBlocks(assistantContent);
                if (execBlocks.length > 0) {
                  setPendingExec(execBlocks);
                } else {
                  // Track the timer so it can be cancelled on
                  // unmount, Stop, or session switch.
                  const sessionAtShow = activeSessionId;
                  showTimerRef.current = setTimeout(() => {
                    showTimerRef.current = null;
                    // Guard: only auto-continue if still in the same session.
                    if (session.sessionIdRef.current !== sessionAtShow) return;
                    handleSubmitRef.current(
                      "Here are the lines you requested. Continue with your task.",
                    );
                  }, 100);
                }
              } else {
                // No SHOW blocks — check for command blocks only.
                const execBlocks = parseExecBlocks(assistantContent);
                if (execBlocks.length > 0) {
                  setPendingExec(execBlocks);
                }
              }

              // Session naming is user-triggered via the magic wand button
              // in the session bar — no automatic LLM calls.
            }
          }
        });

        llmStream.on("error", (err: Error) => {
          session.writeMessage({
            date: new Date().toISOString(),
            sender: "system",
            content: `Error: ${err.message ?? err}`,
            msg_event: "error",
            session_id: activeSessionId,
          });
          streamRef.current = null;
          inputLockedRef.current = false;
          session.setGenerating(false);
        });
      } catch (err: any) {
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Error: ${err.message ?? err}`,
          msg_event: "error",
          session_id: activeSessionId,
        });
        inputLockedRef.current = false;
        session.setGenerating(false);
      }
    },
    [
      input,
      session.messages,
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
      // Capture session ID before the async gap — if the user switches
      // sessions while the command runs, the result still lands in the
      // session that triggered it.
      const execSessionId = session.sessionIdRef.current;
      const dir = path_split(path).head || ".";
      try {
        const result = await exec(
          {
            project_id,
            command: "/bin/bash",
            args: ["-c", command],
            timeout: 30,
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
          session_id: execSessionId,
        });
      } catch (err: any) {
        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Error running \`${command}\`: ${err.message ?? err}`,
          msg_event: "exec_result",
          session_id: execSessionId,
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
        // Note: baseSnapshot can be "" for empty files — that's valid.
        if (
          parseEditBlocks(renderedContent).length > 0 &&
          baseSnapshot != null
        ) {
          renderedContent = formatEditBlocksAsDiff(
            renderedContent,
            baseSnapshot,
          );
        } else {
          renderedContent = formatSearchReplaceAsDiff(renderedContent);
        }
        return (
          <CollapsibleDiffs>
            <StaticMarkdown value={renderedContent} />
          </CollapsibleDiffs>
        );
      }
      // system — show_lines: plain syntax-highlighted code
      if (msg.event === "show_lines") {
        return (
          <CollapsibleDiffs maxHeight={DIFF_MAX_HEIGHT}>
            <StaticMarkdown value={msg.content} />
          </CollapsibleDiffs>
        );
      }
      // All other system messages (exec_result, error, etc.)
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

      <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
        <AgentMessages
          session={session}
          renderMessage={renderMessage}
          emptyText="Ask the agent to help with your document. It can see the editor content, suggest edits, run shell commands, and trigger builds."
        />
      </FileContext.Provider>

      {/* Pending edits action bar */}
      {pendingEdits && (
        <div
          style={{
            flex: "0 0 auto",
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
            flex: "0 0 auto",
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
              <Button
                size="small"
                type="primary"
                onClick={() => handleExecCommand(cmd.command)}
              >
                <Icon name="play" /> Run
              </Button>
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
          // Detach the stream so no more tokens are processed after
          // the user clicks Stop.  Keep a no-op error handler so late
          // transport errors don't become uncaught exceptions.
          const stream = streamRef.current;
          if (stream) {
            stream.removeAllListeners();
            stream.on("error", () => {});
            streamRef.current = null;
          }
          // Cancel any pending SHOW auto-continuation.
          if (showTimerRef.current) {
            clearTimeout(showTimerRef.current);
            showTimerRef.current = null;
          }
          inputLockedRef.current = false;
          setInput(lastSubmittedRef.current);
          setInputKey((k) => k + 1);
        }}
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
          ref={inputWrapperRef}
          onFocus={updateEditorContext}
        >
          <MarkdownInput
            key={inputKey}
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
