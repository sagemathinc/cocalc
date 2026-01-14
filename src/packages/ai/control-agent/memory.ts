/*
In-memory adapter implementations for control-agent wiring and tests.
*/

import type {
  ControlAgentAdapter,
  ControlAgentAuditAdapter,
  ControlAgentConfirmationAdapter,
  ControlAgentContextAdapter,
  ControlAgentPersistenceAdapter,
  ControlAgentToolAdapter,
} from "./adapters";
import type {
  ControlAgentAuditEvent,
  ControlAgentCapabilities,
  ControlAgentConfirmation,
  ControlAgentConfirmationRequest,
  ControlAgentContext,
  ControlAgentMessage,
  ControlAgentThread,
} from "./types";

type ThreadStore = {
  thread: ControlAgentThread;
  messages: ControlAgentMessage[];
};

function createThreadId(counter: number): string {
  return `thread-${Date.now()}-${counter}`;
}

function createConfirmationToken(): string {
  return `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createInMemoryControlAgentAdapter(options: {
  context: ControlAgentContext;
  capabilities: ControlAgentCapabilities;
  tools: ControlAgentToolAdapter;
}): ControlAgentAdapter {
  const threads = new Map<string, ThreadStore>();
  const confirmations = new Map<string, ControlAgentConfirmation>();
  const auditLog: ControlAgentAuditEvent[] = [];
  let threadCounter = 0;

  const contextAdapter: ControlAgentContextAdapter = {
    toString: () => "InMemoryControlAgentContextAdapter",
    getContext: async () => options.context,
    getCapabilities: async () => options.capabilities,
  };

  const persistenceAdapter: ControlAgentPersistenceAdapter = {
    toString: () => "InMemoryControlAgentPersistenceAdapter",
    getThread: async (threadId) => threads.get(threadId)?.thread ?? null,
    createThread: async ({ title, metadata }) => {
      const now = new Date().toISOString();
      const thread: ControlAgentThread = {
        threadId: createThreadId(threadCounter++),
        title,
        createdAt: now,
        updatedAt: now,
        metadata,
      };
      threads.set(thread.threadId, { thread, messages: [] });
      return thread;
    },
    listThreads: async ({ limit, before } = {}) => {
      const list = Array.from(threads.values()).map((entry) => entry.thread);
      const filtered = before
        ? list.filter((thread) => thread.updatedAt < before)
        : list;
      const sorted = filtered.sort((a, b) =>
        a.updatedAt > b.updatedAt ? -1 : 1,
      );
      return limit ? sorted.slice(0, limit) : sorted;
    },
    appendMessage: async (threadId, message) => {
      const entry = threads.get(threadId);
      if (!entry) {
        return;
      }
      entry.messages.push(message);
      entry.thread.updatedAt = message.createdAt;
    },
  };

  const auditAdapter: ControlAgentAuditAdapter = {
    toString: () => "InMemoryControlAgentAuditAdapter",
    recordEvent: async (event) => {
      auditLog.push(event);
    },
  };

  const confirmationAdapter: ControlAgentConfirmationAdapter = {
    toString: () => "InMemoryControlAgentConfirmationAdapter",
    createConfirmation: async (
      request: ControlAgentConfirmationRequest,
    ): Promise<ControlAgentConfirmation> => {
      const now = new Date().toISOString();
      const confirmation: ControlAgentConfirmation = {
        token: createConfirmationToken(),
        requestId: request.requestId,
        scope: request.scope,
        createdAt: now,
        expiresAt: request.expiresAt,
        metadata: request.metadata,
      };
      confirmations.set(confirmation.token, confirmation);
      return confirmation;
    },
    getConfirmation: async (token) => confirmations.get(token) ?? null,
    consumeConfirmation: async (token) => {
      const existing = confirmations.get(token);
      if (existing) {
        confirmations.set(token, {
          ...existing,
          consumedAt: new Date().toISOString(),
        });
      }
    },
  };

  return {
    toString: () => "InMemoryControlAgentAdapter",
    context: contextAdapter,
    persistence: persistenceAdapter,
    audit: auditAdapter,
    confirmations: confirmationAdapter,
    tools: options.tools,
  };
}
