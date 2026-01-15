/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
// To debug LLM history in the browser console:
c = cc.client.conat_client
// Get the shared LLM history streams
stream = await c.dstream({account_id: cc.client.account_id, name: 'llm-history'})
// View prompts
console.log('LLM prompts:', stream.getAll())
// Add a prompt to general
stream.push("New prompt")
// Listen to changes
stream.on('change', (prompt) => console.log('New prompt:', prompt))
*/

import { useEffect, useState } from "react";

import type { DStream } from "@cocalc/conat/sync/dstream";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { CONAT_LLM_HISTORY_KEY } from "@cocalc/util/consts";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

// limit max prompts to keep in history per type
const MAX_PROMPTS_NUM = 1000;
const MAX_PROMPTS_BYTES = 1024 * 1024;

export type LLMHistoryType = "general" | "formula" | "generate";

interface LLMHistoryEntry {
  type: LLMHistoryType;
  prompt: string;
}

type Listener = (newEntry: LLMHistoryEntry) => void;

// Single cache for the shared dstream
let streamCache: DStream<LLMHistoryEntry> | null = null;
const historySubscribers = new Set<Listener>();
let sharedListener: Listener | null = null;
// The single stream instance that currently has the shared listener attached.
let attachedStream: DStream<LLMHistoryEntry> | null = null;

function getSharedListener() {
  if (!sharedListener) {
    sharedListener = (newEntry: LLMHistoryEntry) => {
      for (const subscriber of historySubscribers) {
        subscriber(newEntry);
      }
    };
  }
  return sharedListener;
}

function attachSharedListener(stream: DStream<LLMHistoryEntry>) {
  if (attachedStream === stream) {
    return;
  }

  const listener = getSharedListener();

  if (attachedStream) {
    attachedStream.off("change", listener);
  }

  attachedStream = stream;
  attachedStream.on("change", listener);
}

function detachSharedListener() {
  if (attachedStream && sharedListener) {
    attachedStream.off("change", sharedListener);
  }
  attachedStream = null;
}

// Get or create the single shared dstream
const getDStream = reuseInFlight(async () => {
  if (streamCache) {
    return streamCache;
  }

  try {
    // Wait until account is authenticated
    const store = redux.getStore("account");
    await store.async_wait({
      until: () => store.get_account_id() != null,
      timeout: 0, // indefinite timeout
    });

    const account_id = store.get_account_id();
    const stream = await webapp_client.conat_client.dstream<LLMHistoryEntry>({
      account_id,
      name: CONAT_LLM_HISTORY_KEY,
      config: {
        discard_policy: "old",
        max_msgs: MAX_PROMPTS_NUM,
        max_bytes: MAX_PROMPTS_BYTES,
      },
    });

    streamCache = stream;
    return stream;
  } catch (err) {
    console.warn(`dstream LLM history initialization error -- ${err}`);
    throw err;
  }
});

// Hook for managing LLM prompt history using dstream
export function useLLMHistory(type: LLMHistoryType = "general") {
  const [prompts, setPrompts] = useState<string[]>([]);

  // Filter prompts by type and extract just the prompt strings (newest first)
  function filterPromptsByType(entries: LLMHistoryEntry[]): string[] {
    return entries
      .filter((entry) => entry.type === type)
      .map((entry) => entry.prompt)
      .reverse();
  }

  // Initialize dstream and set up listeners
  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const initializeStream = async () => {
      try {
        const stream = await getDStream();

        // Check if component was unmounted while we were waiting
        if (!isMounted) {
          return;
        }

        const allEntries = stream.getAll();
        setPrompts(filterPromptsByType(allEntries));

        const subscriber: Listener = (newEntry: LLMHistoryEntry) => {
          // Only update if the new entry matches our type
          if (newEntry.type !== type) {
            return;
          }

          setPrompts((prev) => {
            // Remove duplicate if exists, then add to front
            const filtered = prev.filter((p) => p !== newEntry.prompt);
            return [newEntry.prompt, ...filtered];
          });
        };

        historySubscribers.add(subscriber);
        attachSharedListener(stream);
        unsubscribe = () => {
          historySubscribers.delete(subscriber);
          if (historySubscribers.size === 0) {
            detachSharedListener();
          }
        };
      } catch (err) {
        console.warn(`LLM history hook initialization error -- ${err}`);
      }
    };

    initializeStream();

    // Cleanup function for useEffect
    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [type]);

  async function addPrompt(prompt: string) {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      console.warn("use-llm-history: ignoring empty prompt");
      return;
    }

    try {
      const stream = await getDStream();

      // Create entry object with type and prompt
      const entry: LLMHistoryEntry = {
        type,
        prompt: trimmedPrompt,
      };

      // Add entry to stream - this will trigger a change event
      stream.push(entry);
    } catch (err) {
      console.warn(`Error adding prompt to LLM history -- ${err}`);
    }
  }

  async function clearHistory() {
    try {
      const stream = await getDStream();

      // Clear local state immediately
      setPrompts([]);

      // Delete the stream to clear all history
      await stream.delete();

      // Remove from cache so a new stream will be created
      streamCache = null;
      detachSharedListener();
      if (historySubscribers.size > 0) {
        attachSharedListener(await getDStream());
      }
    } catch (err) {
      console.warn(`Error clearing LLM history -- ${err}`);
      // Reload prompts on error
      try {
        const stream = await getDStream();
        const allEntries = stream.getAll();
        setPrompts(filterPromptsByType(allEntries));
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
