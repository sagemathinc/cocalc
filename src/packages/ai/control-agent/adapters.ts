/*
Adapters for control-agent execution.
*/

import type {
  ControlAgentAuditEvent,
  ControlAgentCapabilities,
  ControlAgentConfirmation,
  ControlAgentConfirmationRequest,
  ControlAgentContext,
  ControlAgentMessage,
  ControlAgentThread,
} from "./types";

export type ControlAgentContextAdapter = {
  toString: () => string;
  getContext(): Promise<ControlAgentContext>;
  getCapabilities(): Promise<ControlAgentCapabilities>;
};

export type ControlAgentPersistenceAdapter = {
  toString: () => string;
  getThread(threadId: string): Promise<ControlAgentThread | null>;
  createThread(options: {
    title?: string;
    metadata?: Record<string, string>;
  }): Promise<ControlAgentThread>;
  listThreads(options?: {
    limit?: number;
    before?: string;
  }): Promise<ControlAgentThread[]>;
  appendMessage(threadId: string, message: ControlAgentMessage): Promise<void>;
};

export type ControlAgentAuditAdapter = {
  toString: () => string;
  recordEvent(event: ControlAgentAuditEvent): Promise<void>;
};

export type ControlAgentConfirmationAdapter = {
  toString: () => string;
  createConfirmation(
    request: ControlAgentConfirmationRequest,
  ): Promise<ControlAgentConfirmation>;
  getConfirmation(token: string): Promise<ControlAgentConfirmation | null>;
  consumeConfirmation(token: string): Promise<void>;
};

export type ControlAgentToolContext = {
  requestId: string;
  dryRun?: boolean;
  confirmToken?: string;
  context: ControlAgentContext;
  capabilities: ControlAgentCapabilities;
};

export type ControlAgentToolHandler<Input = unknown, Output = unknown> = (
  input: Input,
  context: ControlAgentToolContext,
) => Promise<Output>;

export type ControlAgentToolAdapter = {
  toString: () => string;
  getToolHandlers(): Record<string, ControlAgentToolHandler>;
};

export type ControlAgentAdapter = {
  toString: () => string;
  context: ControlAgentContextAdapter;
  persistence: ControlAgentPersistenceAdapter;
  audit: ControlAgentAuditAdapter;
  confirmations: ControlAgentConfirmationAdapter;
  tools: ControlAgentToolAdapter;
};
