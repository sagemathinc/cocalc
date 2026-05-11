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

import { Button, Switch, Tooltip } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { LLMCostEstimationChat } from "@cocalc/frontend/chat/llm-cost-estimation";
import { Icon } from "@cocalc/frontend/components";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { EditorComponentProps } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { three_way_merge } from "@cocalc/util/dmp";
import { filename_extension, path_split, trunc, uuid } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import {
  AgentErrorBoundary,
  AgentHeader,
  AgentInputArea,
  AgentMessages,
  AgentRollbackHint,
  AgentSessionBar,
  CONTAINER_STYLE,
  PendingExecBar,
  RenameModal,
  runStreamingTurn,
  useAgentSession,
  useAutoNameSession,
  useCostEstimate,
} from "./agent-base";
import type { DisplayMessage, StreamHandle } from "./agent-base";
import { RUN_COMMANDS } from "../code-editor/editor";
import {
  CollapsibleDiffs,
  COMPACT_CONTEXT_COLOR,
} from "./coding-agent-components";
import type { EditBlock, ExecBlock, SearchReplace } from "./coding-agent-types";
import { DIFF_MAX_HEIGHT, TAG } from "./coding-agent-types";
import { normalizeAssistantSeed } from "./assistant-seed";
import {
  applyEditBlocks,
  applySearchReplace,
  buildSystemPrompt,
  formatEditBlocksAsDiff,
  formatExecResult,
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
  getCodingAgentFewShotExamples,
} from "./coding-agent-utils";
import {
  buildBoundedHistory,
  estimateConversationTokens,
  getAgentInputTokenBudget,
  type AgentHistoryMessage,
} from "./history-budget";

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
export function CodingAgentEmbedded({
  chatSyncdb,
  fontSize,
}: {
  chatSyncdb: any;
  fontSize?: number;
}) {
  if (chatSyncdb == null) {
    console.warn("CodingAgentEmbedded: chatSyncdb is null — not rendering");
    return null;
  }
  return (
    <AgentErrorBoundary>
      <CodingAgentCore chatSyncdb={chatSyncdb} fontSize={fontSize} />
    </AgentErrorBoundary>
  );
}

/* ------------------------------------------------------------------ */
/*  Core component                                                     */
/* ------------------------------------------------------------------ */

function CodingAgentCore({
  chatSyncdb,
  fontSize: fontSizeProp,
}: { chatSyncdb?: any; fontSize?: number } = {}) {
  const {
    project_id,
    path,
    actions,
    desc,
    id: frameId,
    font_size: frameContextFontSize,
  } = useFrameContext();
  // Prefer the explicit prop (from embedded side-chat), fall back to frame context.
  const fontSize = fontSizeProp ?? frameContextFontSize;
  const [model, setModel] = useLanguageModelSetting(project_id);
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
  const llm_markup = useTypedRedux("customize", "llm_markup");
  const projectsStore = redux.getStore("projects");
  const projectReadOnly =
    projectsStore.hasLanguageModelEnabled(project_id, "help-me-fix-hint") &&
    !projectsStore.hasFullLanguageModelEnabled(project_id);
  const llmTag = projectReadOnly ? "explain" : TAG;

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
  const [pendingEdits, setPendingEdits] = useState<
    | { type: "edit_blocks"; blocks: EditBlock[]; base: string }
    | { type: "search_replace"; blocks: SearchReplace[]; base: string }
    | undefined
  >();
  const [pendingExec, setPendingExec] = useState<ExecBlock[]>([]);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [readOnlySessionId, setReadOnlySessionId] = useState<string>();
  // Tracks whether edits have been applied in this turn — highlights the
  // Done button to encourage the user to close the turn and save tokens.
  // Reset when the session (turn) changes (e.g. user clicks Done).
  const [editsApplied, setEditsApplied] = useState(false);
  // SHOW auto-continuation timer — cleared on unmount/cancel/session switch
  // to prevent stale callbacks firing into the wrong session.
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track in-flight exec block IDs to prevent double-dispatch
  const executingExecIdsRef = useRef<Set<number>>(new Set());
  // Auto-accept edits — persisted in local_view_state so it survives reloads
  const [autoAccept, setAutoAcceptState] = useState<boolean>(() => {
    try {
      const stored = actions.store
        ?.get("local_view_state")
        ?.get("coding_agent_auto_accept");
      // Default to false if never explicitly set
      return stored == null ? false : !!stored;
    } catch {
      return false;
    }
  });
  const setAutoAccept = useCallback(
    (v: boolean) => {
      setAutoAcceptState(v);
      actions.set_local_view_state?.({ coding_agent_auto_accept: v });
    },
    [actions],
  );
  const prevSessionIdRef = useRef(session.sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current === session.sessionId) return;
    prevSessionIdRef.current = session.sessionId;
    setEditsApplied(false);
    // Clear stale pending state from the previous session — otherwise
    // the "Apply to Editor" and "Commands to run" bars stay visible
    // and would act on the wrong session's context.
    setPendingEdits(undefined);
    setPendingExec([]);
    // Cancel any pending SHOW auto-continuation — it belongs to the
    // previous session and must not fire into the new one.
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, [session.sessionId]);

  // Auto-accept: when enabled, apply edits as soon as they arrive
  const handleApplyEditsRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (autoAccept && pendingEdits) {
      handleApplyEditsRef.current();
    }
  }, [autoAccept, pendingEdits]);

  // Ref to always call the latest handleSubmit so auto-continuation
  // (e.g. <<<SHOW fulfillment) avoids stale closures.
  const handleSubmitRef = useRef<
    (directInput?: string, opts?: { readOnly?: boolean }) => Promise<void>
  >(async () => {});

  // Stores the last submitted prompt so Stop can restore it.
  const lastSubmittedRef = useRef("");
  const inputLockedRef = useRef(false);

  // Active LLM stream ref — allows cancel to stop processing tokens.
  const streamRef = useRef<StreamHandle | null>(null);

  // ---- Cleanup on unmount ----
  // Clear pending timers and detach any active stream so callbacks
  // don't fire on unmounted component state.
  useEffect(() => {
    return () => {
      clearEstimate();
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
  const panelRef = useRef<HTMLDivElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  // Clear context label only when focus leaves the whole agent panel.
  // Clicking buttons inside the panel (e.g. Run/Apply) should not cause
  // the indicator to disappear and reflow the layout under the pointer.
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
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

  const autoNameSession = useAutoNameSession({
    session,
    model,
    project_id,
    tag: llmTag,
  });
  const processedAssistantSeedRef = useRef("");

  const buildHistoryForLlm = useCallback(
    (prompt: string, system: string): AgentHistoryMessage[] => {
      const historyEvents = new Set(["message", "exec_result", "show_lines"]);
      const preparedHistory = session.messages
        .filter((m) => historyEvents.has(m.event))
        .map(
          (m): AgentHistoryMessage => ({
            role:
              m.sender === "assistant"
                ? ("assistant" as const)
                : ("user" as const),
            content: truncateMiddle(m.content),
          }),
        );
      const readOnly =
        projectReadOnly ||
        (session.sessionId != null && readOnlySessionId === session.sessionId);
      const fewShot = getCodingAgentFewShotExamples(readOnly);
      return buildBoundedHistory({
        system,
        input: prompt,
        history: [...fewShot, ...preparedHistory],
        maxInputTokens: getAgentInputTokenBudget(model),
      }).history;
    },
    [
      model,
      projectReadOnly,
      readOnlySessionId,
      session.sessionId,
      session.messages,
    ],
  );

  const estimateTokens = useCallback(
    (prompt: string) => {
      const ctx = editorContextRef.current ?? getEditorContext(actions);
      const hasBuild = typeof actions.build === "function";
      const readOnly =
        projectReadOnly ||
        (session.sessionId != null && readOnlySessionId === session.sessionId);
      const system = buildSystemPrompt(path, ctx, hasBuild, {
        readOnly,
      });
      const history = buildHistoryForLlm(prompt, system);
      return estimateConversationTokens({ system, input: prompt, history });
    },
    [
      actions,
      buildHistoryForLlm,
      path,
      projectReadOnly,
      readOnlySessionId,
      session.sessionId,
    ],
  );

  // ---- Cost estimation ----
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

  // ---- Submit handler ----
  const handleSubmit = useCallback(
    async (directInput?: string, opts?: { readOnly?: boolean }) => {
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
      const readOnly =
        projectReadOnly ||
        opts?.readOnly === true ||
        readOnlySessionId === activeSessionId;
      if (opts?.readOnly === true && readOnlySessionId !== activeSessionId) {
        setReadOnlySessionId(activeSessionId);
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
        const system = buildSystemPrompt(path, ctx, hasBuild, { readOnly });
        const history = buildHistoryForLlm(prompt, system);

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

        const stream = runStreamingTurn({
          input: prompt,
          system,
          history,
          model,
          project_id,
          tag: llmTag,
          cancelRef: session.cancelRef,
          sessionIdRef: session.sessionIdRef,
          activeSessionId,
          onToken(accumulated, _token) {
            assistantMsg.content = accumulated;
            // Shallow copy triggers React re-render without reallocating
            // every element — the array structure is already built.
            session.setMessages([...streamingMsgs]);
          },
          onComplete(assistantContent) {
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
              if (!readOnly) {
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
                  }
                  // Deliberately do not treat ordinary fenced code blocks
                  // as whole-file replacements. Explanatory assistant replies
                  // often include small snippets, and auto-applying them as a
                  // full document replacement is destructive.
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
                const execBlocks = readOnly
                  ? []
                  : parseExecBlocks(assistantContent);
                if (execBlocks.length > 0) {
                  setPendingExec(execBlocks);
                } else {
                  // Track the timer so it can be cancelled on
                  // unmount, Stop, or session switch.
                  const sessionAtShow = activeSessionId;
                  // Embed the show content directly in the continuation
                  // prompt so the LLM gets the lines without waiting for
                  // SyncDB to round-trip (which is throttled to 300ms).
                  const continuationPrompt = `${showResponse}\n\nContinue with your task.`;
                  showTimerRef.current = setTimeout(() => {
                    showTimerRef.current = null;
                    if (session.sessionIdRef.current !== sessionAtShow) return;
                    handleSubmitRef.current(continuationPrompt);
                  }, 50);
                }
              } else {
                // No SHOW blocks — check for command blocks only.
                const execBlocks = readOnly
                  ? []
                  : parseExecBlocks(assistantContent);
                if (execBlocks.length > 0) {
                  setPendingExec(execBlocks);
                }
              }

              // Session naming is user-triggered via the magic wand button
              // in the session bar — no automatic LLM calls.
            }
          },
          onError(err) {
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
          },
        });
        streamRef.current = stream;
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
      session.sessionId,
      actions,
      buildHistoryForLlm,
      path,
      model,
      llmTag,
      project_id,
      projectReadOnly,
      readOnlySessionId,
      session.messages,
      session.writeMessage,
      session.setGenerating,
      session.setMessages,
      session.setSessionId,
    ],
  );
  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    const seed = normalizeAssistantSeed(desc.get("assistant_seed"));
    if (!seed || processedAssistantSeedRef.current === seed.id) return;
    processedAssistantSeedRef.current = seed.id;
    actions.set_frame_tree({ id: frameId, assistant_seed: undefined });
    if (seed.prefill) {
      // Start a fresh session so the prefilled prompt doesn't inherit
      // unrelated prior conversation context.
      session.handleNewSession();
      setInput(seed.prompt);
      setInputKey((k) => k + 1);
      return;
    }
    if (seed.insert) {
      // Append to existing input (e.g. a cell-style reference). Do not start
      // a new session or submit.
      setInput((prev) => {
        const sep = prev && !prev.endsWith(" ") ? " " : "";
        return `${prev}${sep}${seed.prompt} `;
      });
      setInputKey((k) => k + 1);
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
      return;
    }

    try {
      actions.set_value(newContent);
      setEditsApplied(true);
      // Trigger a save so "build on save" kicks in automatically
      setTimeout(() => actions.save?.(true), 500);
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
  handleApplyEditsRef.current = handleApplyEdits;

  // ---- Exec command ----
  const handleExecCommand = useCallback(
    async (blockId: number, command: string) => {
      // Prevent double-dispatch: skip if this block is already executing
      if (executingExecIdsRef.current.has(blockId)) return;
      executingExecIdsRef.current.add(blockId);
      // Remove the pending command immediately so the first click gives
      // visible feedback instead of leaving a stale "Run" row in place
      // until the async exec call finishes.
      setPendingExec((prev) => prev.filter((e) => e.id !== blockId));
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

        session.writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: formatExecResult(result, command),
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
      executingExecIdsRef.current.delete(blockId);
    },
    [project_id, path, session.writeMessage],
  );

  const handleBuild = useCallback(() => {
    actions.build?.();
  }, [actions]);

  const handleRunCode = useCallback(() => {
    actions.run_code?.(frameId);
  }, [actions, frameId]);

  const openTimeTravel = useCallback(() => {
    actions.time_travel?.({ frame: true });
  }, [actions]);

  const hasBuild = typeof actions.build === "function";
  const hasRunCode = RUN_COMMANDS[filename_extension(path)] != null;

  // ---- Message renderer ----
  const renderMessage = useCallback(
    (msg: DisplayMessage, i: number) => {
      if (msg.sender === "user") {
        return (
          <CollapsibleDiffs
            maxHeight={DIFF_MAX_HEIGHT}
            color={COMPACT_CONTEXT_COLOR}
          >
            <StaticMarkdown value={msg.content} />
          </CollapsibleDiffs>
        );
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
      return (
        <CollapsibleDiffs
          maxHeight={DIFF_MAX_HEIGHT}
          color={COMPACT_CONTEXT_COLOR}
        >
          <StaticMarkdown value={msg.content} />
        </CollapsibleDiffs>
      );
    },
    [session.messages],
  );

  // ---- Render ----
  return (
    <div ref={panelRef} style={CONTAINER_STYLE}>
      <AgentHeader
        title="Coding Agent"
        model={model}
        setModel={setModel}
        project_id={project_id}
        helpContent={
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            <li>
              Ask the agent to edit, refactor, or explain your code. It sees the
              file content around your cursor.
            </li>
            <li>
              <b>Select text</b> to point the agent to the exact lines you want
              it to work on — the selection is included as context.
            </li>
            <li>
              The agent proposes edits as diffs you can accept or reject before
              they are applied.
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
        extraButtons={
          <>
            {hasRunCode && (
              <Button size="small" onClick={handleRunCode}>
                <Icon name="play" /> Run
              </Button>
            )}
            {hasBuild && (
              <Button size="small" onClick={handleBuild}>
                <Icon name="play" /> Build
              </Button>
            )}
          </>
        }
      />

      <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
        <AgentMessages
          session={session}
          renderMessage={renderMessage}
          fontSize={fontSize}
          emptyText="Ask the agent to help with your document. It can see the editor content, suggest edits, run shell commands, and trigger builds."
        />
      </FileContext.Provider>

      {/* Edits action bar */}
      {session.sessionId && (
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
            flexWrap: "wrap",
          }}
        >
          {!autoAccept && (
            <>
              <Button
                size="small"
                type="primary"
                disabled={!pendingEdits}
                onClick={handleApplyEdits}
              >
                Apply to Editor
              </Button>
              <Button
                size="small"
                disabled={!pendingEdits}
                onClick={() => setPendingEdits(undefined)}
              >
                Dismiss
              </Button>
            </>
          )}
          <Tooltip title="Automatically apply all future edits without asking">
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                fontSize: "0.85em",
              }}
            >
              <Switch
                size="small"
                checked={autoAccept}
                onChange={setAutoAccept}
              />
              Auto
            </label>
          </Tooltip>
        </div>
      )}

      {/* Pending exec commands */}
      <PendingExecBar
        pendingExec={pendingExec}
        onRun={handleExecCommand}
        onDismiss={(blockId) =>
          setPendingExec((prev) => prev.filter((e) => e.id !== blockId))
        }
        onDismissAll={() => setPendingExec([])}
      />

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
        belowInput={<AgentRollbackHint onOpenTimeTravel={openTimeTravel} />}
      >
        <div ref={inputWrapperRef} onFocus={updateEditorContext}>
          <MarkdownInput
            key={inputKey}
            value={input}
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
