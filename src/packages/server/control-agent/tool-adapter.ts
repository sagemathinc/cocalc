/*
Minimal control-agent tool handlers for the full hub (multi-user, Postgres).
*/

import type {
  ControlAgentToolAdapter,
  ControlAgentToolContext,
  ControlAgentToolHandler,
} from "@cocalc/ai/control-agent";
import type {
  ControlAgentToolConfirmation,
  ControlAgentToolError,
  ControlAgentToolResult,
  ControlAgentToolSuccess,
  HostStartRequest,
  HostStartResponse,
  WorkspaceAddCollaboratorRequest,
  WorkspaceAddCollaboratorResponse,
  WorkspaceArchiveRequest,
  WorkspaceArchiveResponse,
  WorkspaceCreateRequest,
  WorkspaceCreateResponse,
  WorkspaceDeleteRequest,
  WorkspaceDeleteResponse,
  WorkspaceListRequest,
  WorkspaceListResponse,
  WorkspaceRemoveCollaboratorRequest,
  WorkspaceRemoveCollaboratorResponse,
  WorkspaceRenameRequest,
  WorkspaceRenameResponse,
  WorkspaceTagRequest,
  WorkspaceTagResponse,
  WorkspaceSummary,
} from "@cocalc/ai/control-agent/tools";
import searchAccounts from "@cocalc/server/accounts/search";
import {
  addCollaborator,
  removeCollaborator,
} from "@cocalc/server/projects/collaborators";
import createProject from "@cocalc/server/projects/create";
import getProjects from "@cocalc/server/projects/get";
import setProject from "@cocalc/server/projects/set-one";

type ToolResult<T> = ControlAgentToolResult<T>;

function resolveDryRun(
  context: ControlAgentToolContext,
  input: { dryRun?: boolean },
): boolean {
  return input.dryRun ?? context.dryRun ?? false;
}

function ok<T>(
  requestId: string,
  data: T,
  dryRun?: boolean,
): ControlAgentToolSuccess<T> {
  return {
    status: "ok",
    requestId,
    data,
    ...(dryRun ? { dryRun: true } : {}),
  };
}

function errorResult(
  requestId: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ControlAgentToolError {
  return {
    status: "error",
    requestId,
    error: { code, message, ...(details ? { details } : {}) },
  };
}

function needsConfirmation(
  requestId: string,
  scope: "destructive" | "billing" | "privileged" | "other",
  reason: string,
): ControlAgentToolConfirmation {
  return {
    status: "needs_confirmation",
    requestId,
    requiresConfirmation: true,
    confirmation: {
      requestId,
      scope,
      reason,
    },
  };
}

function resolveAccountId(
  context: ControlAgentToolContext,
): string | undefined {
  return context.context.actor.accountId ?? context.context.actor.userId;
}

async function resolveAccountIdByEmail(email: string): Promise<string | null> {
  const results = await searchAccounts({ query: email, only_email: true });
  const match = results.find(
    (entry) => entry.email_address?.toLowerCase() === email.toLowerCase(),
  );
  return match?.account_id ?? results[0]?.account_id ?? null;
}

function toWorkspaceSummary(project: {
  project_id: string;
  title?: string;
  name?: string;
  description?: string;
}): WorkspaceSummary {
  return {
    id: project.project_id,
    name: project.title ?? project.name ?? "Untitled Workspace",
  };
}

async function handleWorkspaceList(
  input: WorkspaceListRequest,
  context: ControlAgentToolContext,
): Promise<ToolResult<WorkspaceListResponse>> {
  const accountId = resolveAccountId(context);
  if (!accountId) {
    return errorResult(input.requestId, "missing_account", "No account id.");
  }
  const projects = await getProjects({ account_id: accountId });
  const query = input.filters?.query?.toLowerCase();
  const filtered = query
    ? projects.filter((project) => {
        const haystack = `${project.title ?? ""} ${project.name ?? ""} ${
          project.description ?? ""
        }`.toLowerCase();
        return haystack.includes(query);
      })
    : projects;
  return ok(input.requestId, {
    workspaces: filtered.map(toWorkspaceSummary),
  });
}

async function handleWorkspaceCreate(
  input: WorkspaceCreateRequest,
  context: ControlAgentToolContext,
): Promise<ToolResult<WorkspaceCreateResponse>> {
  const accountId = resolveAccountId(context);
  if (!accountId) {
    return errorResult(input.requestId, "missing_account", "No account id.");
  }
  const dryRun = resolveDryRun(context, input);
  if (dryRun) {
    return ok(
      input.requestId,
      { workspace: { id: "dry-run", name: input.name } },
      true,
    );
  }
  if (input.initialMembers?.length) {
    const missing: string[] = [];
    for (const member of input.initialMembers) {
      const resolved = await resolveAccountIdByEmail(member.email);
      if (!resolved) {
        missing.push(member.email);
      }
    }
    if (missing.length) {
      return errorResult(
        input.requestId,
        "collaborator_not_found",
        "Missing collaborators.",
        {
          emails: missing,
        },
      );
    }
  }
  const projectId = await createProject({
    account_id: accountId,
    title: input.name,
    region: input.region,
  });
  if (input.initialMembers?.length) {
    for (const member of input.initialMembers) {
      const resolved = await resolveAccountIdByEmail(member.email);
      if (!resolved) {
        continue;
      }
      await addCollaborator({
        account_id: accountId,
        opts: { project_id: projectId, account_id: resolved },
      });
    }
  }
  return ok(input.requestId, {
    workspace: { id: projectId, name: input.name },
  });
}

async function handleWorkspaceRename(
  input: WorkspaceRenameRequest,
  context: ControlAgentToolContext,
): Promise<ToolResult<WorkspaceRenameResponse>> {
  const accountId = resolveAccountId(context);
  if (!accountId) {
    return errorResult(input.requestId, "missing_account", "No account id.");
  }
  const dryRun = resolveDryRun(context, input);
  if (dryRun) {
    return ok(
      input.requestId,
      { workspace: { id: input.workspaceId, name: input.name } },
      true,
    );
  }
  const updated = await setProject({
    acting_account_id: accountId,
    project_id: input.workspaceId,
    project_update: { title: input.name },
  });
  return ok(input.requestId, {
    workspace: {
      id: input.workspaceId,
      name: updated?.title ?? input.name,
    },
  });
}

async function handleWorkspaceArchive(
  input: WorkspaceArchiveRequest,
): Promise<ToolResult<WorkspaceArchiveResponse>> {
  return errorResult(
    input.requestId,
    "not_supported",
    "Workspace archiving is not implemented yet.",
  );
}

async function handleWorkspaceDelete(
  input: WorkspaceDeleteRequest,
): Promise<ToolResult<WorkspaceDeleteResponse>> {
  return needsConfirmation(
    input.requestId,
    "destructive",
    "Deleting a workspace is destructive and requires confirmation.",
  );
}

async function handleWorkspaceAddCollaborator(
  input: WorkspaceAddCollaboratorRequest,
  context: ControlAgentToolContext,
): Promise<ToolResult<WorkspaceAddCollaboratorResponse>> {
  const accountId = resolveAccountId(context);
  if (!accountId) {
    return errorResult(input.requestId, "missing_account", "No account id.");
  }
  const dryRun = resolveDryRun(context, input);
  if (dryRun) {
    return ok(
      input.requestId,
      {
        workspaceId: input.workspaceId,
        email: input.email,
        role: input.role,
      },
      true,
    );
  }
  const resolved = await resolveAccountIdByEmail(input.email);
  if (!resolved) {
    return errorResult(
      input.requestId,
      "collaborator_not_found",
      "Unknown collaborator.",
    );
  }
  await addCollaborator({
    account_id: accountId,
    opts: { project_id: input.workspaceId, account_id: resolved },
  });
  return ok(input.requestId, {
    workspaceId: input.workspaceId,
    email: input.email,
    role: input.role,
  });
}

async function handleWorkspaceRemoveCollaborator(
  input: WorkspaceRemoveCollaboratorRequest,
  context: ControlAgentToolContext,
): Promise<ToolResult<WorkspaceRemoveCollaboratorResponse>> {
  const accountId = resolveAccountId(context);
  if (!accountId) {
    return errorResult(input.requestId, "missing_account", "No account id.");
  }
  const dryRun = resolveDryRun(context, input);
  if (dryRun) {
    return ok(
      input.requestId,
      { workspaceId: input.workspaceId, email: input.email, removed: true },
      true,
    );
  }
  const resolved = await resolveAccountIdByEmail(input.email);
  if (!resolved) {
    return errorResult(
      input.requestId,
      "collaborator_not_found",
      "Unknown collaborator.",
    );
  }
  await removeCollaborator({
    account_id: accountId,
    opts: { project_id: input.workspaceId, account_id: resolved },
  });
  return ok(input.requestId, {
    workspaceId: input.workspaceId,
    email: input.email,
    removed: true,
  });
}

async function handleWorkspaceTag(
  input: WorkspaceTagRequest,
): Promise<ToolResult<WorkspaceTagResponse>> {
  return errorResult(
    input.requestId,
    "not_supported",
    "Workspace tagging is not implemented yet.",
  );
}

async function handleHostStart(
  input: HostStartRequest,
): Promise<ToolResult<HostStartResponse>> {
  return needsConfirmation(
    input.requestId,
    "billing",
    "Starting a host can incur cost and requires confirmation.",
  );
}

export function createFullControlAgentToolAdapter(): ControlAgentToolAdapter {
  const handlers: Record<string, ControlAgentToolHandler> = {
    "workspace.list": handleWorkspaceList,
    "workspace.create": handleWorkspaceCreate,
    "workspace.rename": handleWorkspaceRename,
    "workspace.archive": handleWorkspaceArchive,
    "workspace.delete": handleWorkspaceDelete,
    "workspace.add_collaborator": handleWorkspaceAddCollaborator,
    "workspace.remove_collaborator": handleWorkspaceRemoveCollaborator,
    "workspace.tag": handleWorkspaceTag,
    "host.start": handleHostStart,
  };
  return {
    toString: () => "FullControlAgentToolAdapter",
    getToolHandlers: () => handlers,
  };
}

export type { ControlAgentToolHandler };
