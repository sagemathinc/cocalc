/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
// To debug LLM history in the browser console:
c = cc.client.conat_client
// Get the shared LLM history store (using CONAT_LLM_HISTORY_KEY)
llm = await c.dkv({account_id: cc.client.account_id, name: 'llm-history'})
// View general prompts
console.log('General LLM prompts:', llm.get('general'))
// View formula prompts
console.log('Formula prompts:', llm.get('formula'))
// Add a prompt to general
llm.set('general', [...(llm.get('general') || []), "New prompt"])
// Listen to changes
llm.on('change', (e) => console.log('LLM history change:', e))
*/

import { useState } from "react";
import useAsyncEffect from "use-async-effect";

import type { DKV } from "@cocalc/conat/sync/dkv";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { CONAT_LLM_HISTORY_KEY } from "@cocalc/util/consts";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

// Maximum number of prompts to keep in history per key
export const MAX_PROMPTS = 100;

export type LLMHistoryType = "general" | "formula";

// Shared conat store instance for all LLM history types
let globalConatStore: DKV<string[]> | null = null;

// Simple event emitter for cross-hook communication
class LLMHistoryEventEmitter {
  private listeners: Map<LLMHistoryType, Set<(prompts: string[]) => void>> =
    new Map();

  on(type: LLMHistoryType, callback: (prompts: string[]) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
  }

  off(type: LLMHistoryType, callback: (prompts: string[]) => void) {
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      typeListeners.delete(callback);
      if (typeListeners.size === 0) {
        this.listeners.delete(type);
      }
    }
  }

  emit(type: LLMHistoryType, prompts: string[]) {
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      typeListeners.forEach((callback) => callback(prompts));
    }
  }
}

const eventEmitter = new LLMHistoryEventEmitter();

// Reusable conat store initialization
const getConatStore = reuseInFlight(async () => {
  try {
    // Wait until account is authenticated
    const store = redux.getStore("account");
    await store.async_wait({
      until: () => store.get_account_id() != null,
      timeout: 0, // indefinite timeout
    });

    const account_id = store.get_account_id();
    const conatStore = await webapp_client.conat_client.dkv<string[]>({
      account_id,
      name: CONAT_LLM_HISTORY_KEY,
    });

    globalConatStore = conatStore;

    // Single global change listener - emit events to hooks
    conatStore.on(
      "change",
      (changeEvent: { key: string; value?: string[]; prev?: string[] }) => {
        const changedType = changeEvent.key as LLMHistoryType;
        const remotePrompts = changeEvent.value || [];

        // Normalize and emit to hooks listening for this type
        const normalizedPrompts = remotePrompts
          .filter((prompt) => typeof prompt === "string" && prompt.trim())
          .slice(0, MAX_PROMPTS);

        eventEmitter.emit(changedType, normalizedPrompts);
      },
    );

    return conatStore;
  } catch (err) {
    console.warn(`conat LLM history initialization warning -- ${err}`);
    throw err;
  }
});

// Hook for managing LLM prompt history using conat
export function useLLMHistory(type: LLMHistoryType = "general") {
  const [prompts, setPrompts] = useState<string[]>([]);

  // Normalize prompt list: filter valid strings and limit size
  function normalizePrompts(promptList: string[]): string[] {
    return promptList
      .filter((prompt) => typeof prompt === "string" && prompt.trim())
      .slice(0, MAX_PROMPTS);
  }

  // Initialize shared conat store once, waiting for authentication
  useAsyncEffect(async () => {
    try {
      await getConatStore();
      return loadPromptsForType();
    } catch (err) {
      console.warn(`LLM history hook initialization error -- ${err}`);
    }
  }, [type]);

  function loadPromptsForType() {
    if (!globalConatStore) {
      return;
    }

    try {
      // Load initial data for this specific type
      const initialPrompts = globalConatStore.get(type) || [];
      if (Array.isArray(initialPrompts)) {
        setPrompts(normalizePrompts(initialPrompts));
      }

      // Register this hook instance to receive updates via event emitter
      eventEmitter.on(type, setPrompts);

      // Return cleanup function
      return () => {
        eventEmitter.off(type, setPrompts);
      };
    } catch (err) {
      console.warn(`conat LLM history load warning -- ${err}`);
    }
  }

  function addPrompt(prompt: string) {
    if (!globalConatStore || !prompt.trim()) {
      console.warn("Conat LLM history not yet initialized or empty prompt");
      return;
    }

    const trimmedPrompt = prompt.trim();

    // Remove existing instance if present, then add to front (newest first)
    const filtered = prompts.filter((p) => p !== trimmedPrompt);
    const updated = normalizePrompts([trimmedPrompt, ...filtered]);

    // Update local state immediately for responsive UI
    setPrompts(updated);

    // Store to conat using type as key (this will also trigger the change event for other clients)
    try {
      globalConatStore.set(type, updated);
    } catch (err) {
      console.warn(`conat LLM history storage warning -- ${err}`);
      // Revert local state on error
      setPrompts(prompts);
    }
  }

  function clearHistory() {
    if (!globalConatStore) {
      console.warn("Conat LLM history not yet initialized");
      return;
    }

    // Update local state immediately
    setPrompts([]);

    // Clear from conat using type as key
    try {
      globalConatStore.set(type, []);
    } catch (err) {
      console.warn(`conat LLM history clear warning -- ${err}`);
      // Revert local state on error
      setPrompts(prompts);
    }
  }

  return {
    prompts,
    addPrompt,
    clearHistory,
  };
}
