/*
Core types for the control-plane agent and its hub adapters.
*/

export type ControlAgentEnvironment = "full" | "lite";

export type ControlAgentActor = {
  accountId?: string;
  userId?: string;
  email?: string;
  displayName?: string;
  role?: string;
};

export type ControlAgentContext = {
  environment: ControlAgentEnvironment;
  actor: ControlAgentActor;
  organizationId?: string;
  locale?: string;
  timezone?: string;
  membershipTier?: string;
  defaultWorkspaceId?: string;
};

export type ControlAgentCapabilities = {
  supportsWorkspaces: boolean;
  supportsCollaborators: boolean;
  supportsOrganization: boolean;
  supportsLogs: boolean;
  supportsConfig: boolean;
  supportsRemoteSync: boolean;
  supportsHandoff: boolean;
};

export type ControlAgentThread = {
  threadId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, string>;
};

export type ControlAgentMessageRole = "user" | "assistant" | "system" | "tool";

export type ControlAgentMessage = {
  id: string;
  role: ControlAgentMessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, string>;
};

export type ControlAgentAuditEvent = {
  eventId: string;
  timestamp: string;
  actor: ControlAgentActor;
  action: string;
  requestId?: string;
  toolName?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: "ok" | "error" | "pending";
};

export type ControlAgentConfirmationScope =
  | "destructive"
  | "billing"
  | "privileged"
  | "other";

export type ControlAgentConfirmationRequest = {
  requestId: string;
  scope: ControlAgentConfirmationScope;
  reason: string;
  expiresAt?: string;
  metadata?: Record<string, string>;
};

export type ControlAgentConfirmation = {
  token: string;
  requestId: string;
  scope: ControlAgentConfirmationScope;
  createdAt: string;
  expiresAt?: string;
  consumedAt?: string;
  metadata?: Record<string, string>;
};

export type ControlAgentIdempotencyKey = string;
