/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
// To debug LLM history in the browser console:
c = cc.client.conat_client
// Get the shared LLM history streams
generalStream = await c.dstream({account_id: cc.client.account_id, name: 'llm-history-general'})
formulaStream = await c.dstream({account_id: cc.client.account_id, name: 'llm-history-formula'})
// View general prompts
console.log('General LLM prompts:', generalStream.getAll())
// View formula prompts
console.log('Formula prompts:', formulaStream.getAll())
// Add a prompt to general
generalStream.push("New prompt")
// Listen to changes
generalStream.on('change', (prompt) => console.log('New general prompt:', prompt))
*/

import { useState } from "react";
import useAsyncEffect from "use-async-effect";

import type { DStream } from "@cocalc/conat/sync/dstream";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { CONAT_LLM_HISTORY_KEY } from "@cocalc/util/consts";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

// limit max prompts to keep in history per type
const MAX_PROMPTS_NUM = 1000;
const MAX_PROMPTS_BYTES = 1024 * 1024;

export type LLMHistoryType = "general" | "formula";

// Cache for dstream instances per type
const streamCache = new Map<LLMHistoryType, DStream<string>>();

// Get or create dstream for a specific history type
const getDStream = reuseInFlight(async (type: LLMHistoryType) => {
  const cachedStream = streamCache.get(type);
  if (cachedStream) {
    return cachedStream;
  }

  try {
    // Wait until account is authenticated
    const store = redux.getStore("account");
    await store.async_wait({
      until: () => store.get_account_id() != null,
      timeout: 0, // indefinite timeout
    });

    const account_id = store.get_account_id();
    const stream = await webapp_client.conat_client.dstream<string>({
      account_id,
      name: `${CONAT_LLM_HISTORY_KEY}-${type}`,
      config: {
        discard_policy: "old",
        max_msgs: MAX_PROMPTS_NUM,
        max_bytes: MAX_PROMPTS_BYTES,
      },
    });

    streamCache.set(type, stream);
    return stream;
  } catch (err) {
    console.warn(`dstream LLM history initialization error -- ${err}`);
    throw err;
  }
});

// Hook for managing LLM prompt history using dstream
export function useLLMHistory(type: LLMHistoryType = "general") {
  const [prompts, setPrompts] = useState<string[]>([]);

  // Initialize dstream and set up listeners
  useAsyncEffect(async () => {
    try {
      const stream = await getDStream(type);

      // Load existing prompts from stream (newest first)
      const allPrompts = stream.getAll().reverse();
      setPrompts(allPrompts);

      // Listen for new prompts being added
      const handleChange = (newPrompt: string) => {
        setPrompts((prev) => {
          // Remove duplicate if exists, then add to front
          const filtered = prev.filter((p) => p !== newPrompt);
          return [newPrompt, ...filtered];
        });
      };

      stream.on("change", handleChange);

      // Cleanup listener on unmount/type change
      return () => {
        stream.off("change", handleChange);
      };
    } catch (err) {
      console.warn(`LLM history hook initialization error -- ${err}`);
    }
  }, [type]);

  async function addPrompt(prompt: string) {
    if (!prompt.trim()) {
      console.warn("Empty prompt provided");
      return;
    }

    try {
      const stream = await getDStream(type);
      const trimmedPrompt = prompt.trim();

      // Add prompt to stream - this will trigger change event
      stream.push(trimmedPrompt);

      // Clean up old prompts if we exceed MAX_PROMPTS
      const currentLength = stream.length;
      if (currentLength > MAX_PROMPTS_NUM) {
        // Note: dstream doesn't have a built-in way to remove old entries
        // but we limit the display to MAX_PROMPTS in the UI
        console.warn(
          `LLM history has ${currentLength} entries, exceeding MAX_PROMPTS=${MAX_PROMPTS_NUM}`,
        );
      }
    } catch (err) {
      console.warn(`Error adding prompt to LLM history -- ${err}`);
    }
  }

  async function clearHistory() {
    try {
      const stream = await getDStream(type);

      // Clear local state immediately
      setPrompts([]);

      // Delete the stream to clear all history
      await stream.delete();

      // Remove from cache so a new stream will be created
      streamCache.delete(type);
    } catch (err) {
      console.warn(`Error clearing LLM history -- ${err}`);
      // Reload prompts on error
      try {
        const stream = await getDStream(type);
        const allPrompts = stream.getAll().slice(-MAX_PROMPTS_NUM).reverse();
        setPrompts(allPrompts);
      } catch (reloadErr) {
        console.warn(
          `Error reloading prompts after clear failure -- ${reloadErr}`,
        );
      }
    }
  }

  return {
    prompts,
    addPrompt,
    clearHistory,
  };
}
