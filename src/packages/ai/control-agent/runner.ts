/*
Control-agent runner that wires tool adapters to a registry and execution flow.
*/

import type { ControlAgentAuditEvent } from "./types";
import {
  getControlAgentToolDefinition,
  listControlAgentTools,
} from "./registry";
import type { ControlAgentToolName, ControlAgentToolResult } from "./tools";
import type {
  ControlAgentAdapter,
  ControlAgentToolContext,
  ControlAgentToolHandler,
} from "./adapters";

export type ControlAgentToolInvocation = {
  name: ControlAgentToolName;
  input: Record<string, unknown>;
};

export type ControlAgentRunner = {
  listTools: () => Promise<ReturnType<typeof listControlAgentTools>>;
  executeTool: (
    invocation: ControlAgentToolInvocation,
  ) => Promise<ControlAgentToolResult>;
};

function getRequestId(input: Record<string, unknown>): string | null {
  const requestId = input.requestId;
  if (typeof requestId !== "string" || !requestId) {
    return null;
  }
  return requestId;
}

function getConfirmToken(input: Record<string, unknown>): string | undefined {
  const confirmToken = input.confirmToken;
  return typeof confirmToken === "string" && confirmToken
    ? confirmToken
    : undefined;
}

function isDryRun(input: Record<string, unknown>): boolean {
  return input.dryRun === true;
}

function createAuditEvent(options: {
  action: string;
  requestId: string;
  toolName: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: ControlAgentAuditEvent["status"];
  actor: ControlAgentAuditEvent["actor"];
}): ControlAgentAuditEvent {
  return {
    eventId: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    actor: options.actor,
    action: options.action,
    requestId: options.requestId,
    toolName: options.toolName,
    payload: options.payload,
    result: options.result,
    status: options.status,
  };
}

async function recordAudit(
  adapter: ControlAgentAdapter,
  event: ControlAgentAuditEvent,
): Promise<void> {
  try {
    await adapter.audit.recordEvent(event);
  } catch {
    // Avoid failing tool execution due to audit errors.
  }
}

function toolError(
  requestId: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ControlAgentToolResult {
  return {
    status: "error",
    requestId,
    error: { code, message, ...(details ? { details } : {}) },
  };
}

function confirmationScope(
  scopes?: string[],
): "destructive" | "billing" | "other" {
  if (!scopes) {
    return "other";
  }
  if (scopes.includes("destructive")) {
    return "destructive";
  }
  if (scopes.includes("billing")) {
    return "billing";
  }
  return "other";
}

export function createControlAgentRunner(
  adapter: ControlAgentAdapter,
): ControlAgentRunner {
  async function listTools() {
    const capabilities = await adapter.context.getCapabilities();
    const handlers = adapter.tools.getToolHandlers();
    const availableTools = Object.keys(handlers) as ControlAgentToolName[];
    return listControlAgentTools({ capabilities, availableTools });
  }

  async function executeTool({
    name,
    input,
  }: ControlAgentToolInvocation): Promise<ControlAgentToolResult> {
    const requestId = getRequestId(input);
    if (!requestId) {
      return toolError(
        "missing-request-id",
        "missing_request_id",
        "Missing request_id.",
      );
    }
    const definition = getControlAgentToolDefinition(name);
    if (!definition) {
      return toolError(requestId, "unknown_tool", `Unknown tool '${name}'.`);
    }

    const handlerMap = adapter.tools.getToolHandlers();
    const handler = handlerMap[name] as ControlAgentToolHandler | undefined;
    if (!handler) {
      return toolError(
        requestId,
        "tool_not_supported",
        `Tool '${name}' is not supported in this environment.`,
      );
    }

    const [context, capabilities] = await Promise.all([
      adapter.context.getContext(),
      adapter.context.getCapabilities(),
    ]);

    const dryRun = isDryRun(input);
    const confirmToken = getConfirmToken(input);
    const toolContext: ControlAgentToolContext = {
      requestId,
      dryRun,
      confirmToken,
      context,
      capabilities,
    };

    if (definition.requiresConfirmation && !dryRun && !confirmToken) {
      const scope = confirmationScope(definition.scopes);
      const confirmation = await adapter.confirmations.createConfirmation({
        requestId,
        scope,
        reason: `${definition.description} requires confirmation.`,
      });
      return {
        status: "needs_confirmation",
        requestId,
        requiresConfirmation: true,
        confirmToken: confirmation.token,
        confirmation: {
          requestId,
          scope,
          reason: `${definition.description} requires confirmation.`,
        },
      };
    }

    if (confirmToken) {
      const confirmation =
        await adapter.confirmations.getConfirmation(confirmToken);
      if (!confirmation) {
        return toolError(
          requestId,
          "invalid_confirmation",
          "Confirmation token is invalid.",
        );
      }
      if (confirmation.requestId !== requestId) {
        return toolError(
          requestId,
          "confirmation_mismatch",
          "Confirmation token does not match request id.",
        );
      }
      if (confirmation.consumedAt) {
        return toolError(
          requestId,
          "confirmation_consumed",
          "Confirmation token was already used.",
        );
      }
    }

    const auditStart = createAuditEvent({
      action: "tool.invoke",
      requestId,
      toolName: name,
      payload: input,
      status: "pending",
      actor: context.actor,
    });
    await recordAudit(adapter, auditStart);

    try {
      const result = await handler(input, toolContext);
      if (result.status === "needs_confirmation") {
        const confirmation = await adapter.confirmations.createConfirmation(
          result.confirmation,
        );
        const updated = { ...result, confirmToken: confirmation.token };
        await recordAudit(
          adapter,
          createAuditEvent({
            action: "tool.needs_confirmation",
            requestId,
            toolName: name,
            payload: input,
            result: updated,
            status: "pending",
            actor: context.actor,
          }),
        );
        return updated;
      }
      if (result.status === "ok" && confirmToken) {
        await adapter.confirmations.consumeConfirmation(confirmToken);
      }
      await recordAudit(
        adapter,
        createAuditEvent({
          action: "tool.complete",
          requestId,
          toolName: name,
          payload: input,
          result,
          status: "ok",
          actor: context.actor,
        }),
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : `${err}`;
      const failure = toolError(requestId, "tool_failed", message);
      await recordAudit(
        adapter,
        createAuditEvent({
          action: "tool.failed",
          requestId,
          toolName: name,
          payload: input,
          result: failure,
          status: "error",
          actor: context.actor,
        }),
      );
      return failure;
    }
  }

  return { listTools, executeTool };
}
