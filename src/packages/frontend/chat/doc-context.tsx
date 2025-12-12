/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 *
 *  Chat now consumes the live SyncDoc (ImmerDB) directly instead of copying
 *  chat messages into Redux. The ChatDocProvider listens to syncdb "change"
 *  events and exposes the current document via React context; components use
 *  useChatDoc() to access it and derive messages on the fly.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PlainChatMessage } from "./types";
import { ChatMessageCache } from "./message-cache";

type DocCtx = {
  version: number;
  messages?: Map<string, PlainChatMessage>;
};

const ChatDocContext = createContext<DocCtx>({
  version: 0,
  messages: undefined,
});

export function ChatDocProvider({
  cache,
  children,
}: {
  cache?: ChatMessageCache;
  children: React.ReactNode;
}) {
  const [version, setVersion] = useState<number>(-1);
  const cacheRef = useRef<ChatMessageCache | null>(cache);

  useEffect(() => {
    cacheRef.current = cache;
    if (!cache) {
      setVersion(-1);
      return;
    }
    cache.on("version", setVersion);
    setVersion(0);
    return () => {
      cache.removeListener("version", setVersion);
    };
  }, [cache]);

  const value = useMemo<DocCtx>(() => {
    return {
      version,
      messages: cacheRef.current?.getMessages(),
    };
  }, [version]);

  return (
    <ChatDocContext.Provider value={value}>{children}</ChatDocContext.Provider>
  );
}

export function useChatDoc(): DocCtx {
  return useContext(ChatDocContext);
}
