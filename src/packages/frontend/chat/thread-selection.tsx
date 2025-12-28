/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect, useMemo, useState } from "@cocalc/frontend/app-framework";
import type { ChatActions } from "./actions";
import { COMBINED_FEED_KEY, type ThreadMeta } from "./threads";
import type { ChatMessages } from "./types";
import { dateValue } from "./access";
import { getThreadRootDate } from "./utils";

interface ThreadSelectionOptions {
  actions: ChatActions;
  threads: ThreadMeta[];
  messages?: ChatMessages;
  fragmentId?: string | null;
  storedThreadFromDesc?: string | null;
}

export function useChatThreadSelection({
  actions,
  threads,
  messages,
  fragmentId,
  storedThreadFromDesc,
}: ThreadSelectionOptions) {
  const [selectedThreadKey, setSelectedThreadKey0] = useState<string | null>(
    storedThreadFromDesc ?? COMBINED_FEED_KEY,
  );
  const [allowAutoSelectThread, setAllowAutoSelectThread] =
    useState<boolean>(true);

  const setSelectedThreadKey = (x: string | null) => {
    if (x != null && x != COMBINED_FEED_KEY) {
      actions.clearAllFilters();
      actions.setFragment();
    }
    setSelectedThreadKey0(x);
    actions.setSelectedThread?.(x);
  };

  const selectedThreadDate = useMemo(() => {
    if (!selectedThreadKey || selectedThreadKey === COMBINED_FEED_KEY) {
      return undefined;
    }
    const millis = parseInt(selectedThreadKey, 10);
    if (!isFinite(millis)) return undefined;
    return new Date(millis);
  }, [selectedThreadKey]);

  const isCombinedFeedSelected = selectedThreadKey === COMBINED_FEED_KEY;
  const singleThreadView = selectedThreadKey != null && !isCombinedFeedSelected;

  useEffect(() => {
    if (
      storedThreadFromDesc != null &&
      storedThreadFromDesc !== selectedThreadKey
    ) {
      setSelectedThreadKey(storedThreadFromDesc);
      setAllowAutoSelectThread(false);
    }
  }, [storedThreadFromDesc]);

  useEffect(() => {
    if (threads.length === 0) {
      if (selectedThreadKey !== null) {
        setSelectedThreadKey(null);
      }
      setAllowAutoSelectThread(true);
      return;
    }
    const exists = threads.some((thread) => thread.key === selectedThreadKey);
    if (!exists && allowAutoSelectThread) {
      setSelectedThreadKey(COMBINED_FEED_KEY);
    }
  }, [threads, selectedThreadKey, allowAutoSelectThread]);

  useEffect(() => {
    if (!fragmentId || messages == null) {
      return;
    }
    const parsed = parseFloat(fragmentId);
    if (!isFinite(parsed)) {
      return;
    }
    const keyStr = `${parsed}`;
    let message = messages.get(keyStr);
    if (message == null) {
      for (const [, msg] of messages) {
        const dateField = dateValue(msg);
        if (dateField?.valueOf?.() === parsed) {
          message = msg;
          break;
        }
      }
    }
    if (message == null) return;
    const root = getThreadRootDate({ date: parsed, messages }) || parsed;
    const threadKey = `${root}`;
    if (threadKey !== selectedThreadKey) {
      setAllowAutoSelectThread(false);
      setSelectedThreadKey(threadKey);
    }
  }, [fragmentId, messages, selectedThreadKey]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.key === selectedThreadKey),
    [threads, selectedThreadKey],
  );

  return {
    selectedThreadKey,
    setSelectedThreadKey,
    setAllowAutoSelectThread,
    selectedThreadDate,
    isCombinedFeedSelected,
    singleThreadView,
    selectedThread,
  };
}
