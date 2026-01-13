/*
Tool contracts and permission metadata for the control-plane agent.
*/

import type {
  ControlAgentConfirmationRequest,
  ControlAgentIdempotencyKey,
} from "./types";

export type ControlAgentPermissionScope =
  | "read"
  | "write"
  | "destructive"
  | "billing";

export type ControlAgentToolName =
  | "workspace.list"
  | "workspace.create"
  | "workspace.rename"
  | "workspace.archive"
  | "workspace.delete"
  | "workspace.add_collaborator"
  | "workspace.remove_collaborator"
  | "workspace.tag"
  | "logs.search"
  | "config.get"
  | "config.set"
  | "editors.list"
  | "sync.configure"
  | "handoff_to_workspace_agent"
  | "ui_action"
  | "host.start";

export type ControlAgentToolDefinition = {
  name: ControlAgentToolName;
  description: string;
  scopes: ControlAgentPermissionScope[];
  requiresConfirmation?: boolean;
};

export const CONTROL_AGENT_TOOL_DEFINITIONS: Readonly<
  Record<ControlAgentToolName, ControlAgentToolDefinition>
> = {
  "workspace.list": {
    name: "workspace.list",
    description: "List workspaces with optional filters.",
    scopes: ["read"],
  },
  "workspace.create": {
    name: "workspace.create",
    description: "Create a workspace.",
    scopes: ["write"],
  },
  "workspace.rename": {
    name: "workspace.rename",
    description: "Rename a workspace.",
    scopes: ["write"],
  },
  "workspace.archive": {
    name: "workspace.archive",
    description: "Archive a workspace.",
    scopes: ["write"],
  },
  "workspace.delete": {
    name: "workspace.delete",
    description: "Delete a workspace.",
    scopes: ["destructive"],
    requiresConfirmation: true,
  },
  "workspace.add_collaborator": {
    name: "workspace.add_collaborator",
    description: "Add a collaborator to a workspace.",
    scopes: ["write"],
  },
  "workspace.remove_collaborator": {
    name: "workspace.remove_collaborator",
    description: "Remove a collaborator from a workspace.",
    scopes: ["write"],
  },
  "workspace.tag": {
    name: "workspace.tag",
    description: "Update workspace tags.",
    scopes: ["write"],
  },
  "logs.search": {
    name: "logs.search",
    description: "Search hub or local logs.",
    scopes: ["read"],
  },
  "config.get": {
    name: "config.get",
    description: "Read configuration values.",
    scopes: ["read"],
  },
  "config.set": {
    name: "config.set",
    description: "Update configuration values.",
    scopes: ["write"],
  },
  "editors.list": {
    name: "editors.list",
    description: "List supported editors.",
    scopes: ["read"],
  },
  "sync.configure": {
    name: "sync.configure",
    description: "Configure remote sync between local and remote workspace.",
    scopes: ["write"],
  },
  handoff_to_workspace_agent: {
    name: "handoff_to_workspace_agent",
    description: "Handoff a task to a workspace-scoped agent.",
    scopes: ["write"],
  },
  ui_action: {
    name: "ui_action",
    description: "Request a UI action from the client.",
    scopes: ["write"],
  },
  "host.start": {
    name: "host.start",
    description: "Start a project host or server.",
    scopes: ["billing"],
    requiresConfirmation: true,
  },
};

export type ControlAgentToolRequestBase = {
  requestId: ControlAgentIdempotencyKey;
  dryRun?: boolean;
  confirmToken?: string;
};

export type ControlAgentToolResultBase = {
  requestId: ControlAgentIdempotencyKey;
  dryRun?: boolean;
  requiresConfirmation?: boolean;
  confirmToken?: string;
};

export type ControlAgentToolError = ControlAgentToolResultBase & {
  status: "error";
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ControlAgentToolConfirmation = ControlAgentToolResultBase & {
  status: "needs_confirmation";
  confirmation: ControlAgentConfirmationRequest;
};

export type ControlAgentToolSuccess<TData = unknown> =
  ControlAgentToolResultBase & {
    status: "ok";
    data: TData;
  };

export type ControlAgentToolResult<TData = unknown> =
  | ControlAgentToolSuccess<TData>
  | ControlAgentToolError
  | ControlAgentToolConfirmation;

export type WorkspaceListFilters = {
  query?: string;
  tags?: string[];
  archived?: boolean;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  state?: string;
  lastOpenedAt?: string;
};

export type CollaboratorRole = string;

export type WorkspaceListRequest = ControlAgentToolRequestBase & {
  filters?: WorkspaceListFilters;
};

export type WorkspaceListResponse = {
  workspaces: WorkspaceSummary[];
};

export type WorkspaceCreateRequest = ControlAgentToolRequestBase & {
  name: string;
  template?: string;
  region?: string;
  visibility?: "private" | "shared" | "public";
  initialMembers?: { email: string; role?: CollaboratorRole }[];
};

export type WorkspaceCreateResponse = {
  workspace: WorkspaceSummary;
};

export type WorkspaceRenameRequest = ControlAgentToolRequestBase & {
  workspaceId: string;
  name: string;
};

export type WorkspaceRenameResponse = {
  workspace: WorkspaceSummary;
};

export type WorkspaceArchiveRequest = ControlAgentToolRequestBase & {
  workspaceId: string;
};

export type WorkspaceArchiveResponse = {
  workspaceId: string;
  archived: boolean;
};

export type WorkspaceDeleteRequest = ControlAgentToolRequestBase & {
  workspaceId: string;
};

export type WorkspaceDeleteResponse = {
  workspaceId: string;
  deleted: boolean;
};

export type WorkspaceAddCollaboratorRequest = ControlAgentToolRequestBase & {
  workspaceId: string;
  email: string;
  role?: CollaboratorRole;
};

export type WorkspaceAddCollaboratorResponse = {
  workspaceId: string;
  email: string;
  role?: CollaboratorRole;
};

export type WorkspaceRemoveCollaboratorRequest = ControlAgentToolRequestBase & {
  workspaceId: string;
  email: string;
};

export type WorkspaceRemoveCollaboratorResponse = {
  workspaceId: string;
  email: string;
  removed: boolean;
};

export type WorkspaceTagRequest = ControlAgentToolRequestBase & {
  workspaceId: string;
  tags: string[];
};

export type WorkspaceTagResponse = {
  workspaceId: string;
  tags: string[];
};

export type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
  source?: string;
};

export type LogsSearchRequest = ControlAgentToolRequestBase & {
  query?: string;
  limit?: number;
  before?: string;
  after?: string;
};

export type LogsSearchResponse = {
  entries: LogEntry[];
};

export type ConfigGetRequest = ControlAgentToolRequestBase & {
  keys?: string[];
};

export type ConfigGetResponse = {
  values: Record<string, unknown>;
};

export type ConfigSetRequest = ControlAgentToolRequestBase & {
  values: Record<string, unknown>;
};

export type ConfigSetResponse = {
  values: Record<string, unknown>;
};

export type EditorInfo = {
  id: string;
  name: string;
  description?: string;
};

export type EditorsListRequest = ControlAgentToolRequestBase;

export type EditorsListResponse = {
  editors: EditorInfo[];
};

export type RemoteSyncDirection = "push" | "pull" | "bidirectional";

export type RemoteSyncConfig = {
  localPath: string;
  remoteWorkspaceId?: string;
  remotePath?: string;
  direction?: RemoteSyncDirection;
  enabled?: boolean;
};

export type SyncConfigureRequest = ControlAgentToolRequestBase & {
  config: RemoteSyncConfig;
};

export type SyncConfigureResponse = {
  config: RemoteSyncConfig;
};

export type HandoffToWorkspaceAgentRequest = ControlAgentToolRequestBase & {
  workspaceId: string;
  summary: string;
  context?: Record<string, unknown>;
};

export type HandoffToWorkspaceAgentResponse = {
  workspaceId: string;
  sessionId?: string;
};

export type UiActionType =
  | "open_workspace"
  | "switch_panel"
  | "highlight"
  | "open_chat";

export type UiActionRequest = ControlAgentToolRequestBase & {
  action: UiActionType;
  target?: string;
  metadata?: Record<string, string>;
};

export type UiActionResponse = {
  action: UiActionType;
  acknowledged: boolean;
};

export type HostStartRequest = ControlAgentToolRequestBase & {
  hostId: string;
};

export type HostStartResponse = {
  hostId: string;
  started: boolean;
};
