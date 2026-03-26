/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared streaming LLM turn logic extracted from all three agent variants
(coding-agent, notebook-agent, agent-panel).

This is a plain async function (NOT a hook) — it's called inside
callbacks, not at component top level.

Each agent supplies callbacks for token handling, completion, and errors.
Post-stream processing (edit blocks, tool loops, file ops) stays in each
agent file — only the queryStream plumbing is shared here.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";

export interface StreamingTurnConfig {
  // LLM call parameters
  input: string;
  system: string;
  history: { role: "user" | "assistant"; content: string }[];
  model: string;
  project_id: string;
  tag: string;

  // Control refs
  cancelRef: { current: boolean };
  /** When provided together with activeSessionId, tokens are silently
   *  dropped if the user switches sessions mid-stream. */
  sessionIdRef?: { current: string };
  activeSessionId?: string;

  // Callbacks
  /** Called on each non-null token with the accumulated content so far
   *  and the individual token that was just received. */
  onToken: (accumulatedContent: string, token: string) => void;
  /** Called when the stream ends (token === null). */
  onComplete: (fullContent: string) => void;
  /** Called when the stream emits an error. */
  onError: (err: Error) => void;
}

export interface StreamHandle {
  removeAllListeners: () => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
}

/**
 * Start a streaming LLM call and wire up token/error handlers.
 *
 * Returns the raw stream handle so the caller can store it in a ref
 * for unmount cleanup.  The function itself does NOT manage any React
 * state — that's the caller's responsibility via the callbacks.
 */
export function runStreamingTurn(config: StreamingTurnConfig): StreamHandle {
  const {
    input,
    system,
    history,
    model,
    project_id,
    tag,
    cancelRef,
    sessionIdRef,
    activeSessionId,
    onToken,
    onComplete,
    onError,
  } = config;

  const stream = webapp_client.openai_client.queryStream({
    input,
    system,
    history,
    model,
    project_id,
    tag,
  });

  let content = "";

  stream.on("token", (token: string | null) => {
    if (cancelRef.current) {
      // Stop processing and detach listeners so no more tokens
      // are handled.  Keep a no-op error handler for safety.
      stream.removeAllListeners();
      stream.on("error", () => {});
      return;
    }
    if (token != null) {
      content += token;
      // Skip callback if the user switched sessions mid-stream.
      if (
        sessionIdRef != null &&
        activeSessionId != null &&
        sessionIdRef.current !== activeSessionId
      ) {
        return;
      }
      onToken(content, token);
    } else {
      // Stream ended — notify the caller.
      onComplete(content);
    }
  });

  stream.on("error", (err: Error) => {
    onError(err);
  });

  return stream;
}
