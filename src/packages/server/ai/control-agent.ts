/*
Dev-only control-agent API for quick end-to-end testing.
*/

import {
  Agent,
  run,
  setDefaultOpenAIKey,
  setTracingDisabled,
  setTracingExportApiKey,
  tool,
} from "@openai/agents";
import type {
  ControlAgentDevResponse,
  ControlAgentTranscriptItem,
} from "@cocalc/conat/hub/api/control-agent";
import type {
  ControlAgentToolDefinition,
  ControlAgentToolName,
} from "@cocalc/ai/control-agent/tools";
import { createFullControlAgentRunner } from "@cocalc/server/control-agent";
import type { ControlAgentContext } from "@cocalc/ai/control-agent";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

const logger = getLogger("control-agent:dev");

type ToolParametersSchema = {
  type: "object";
  properties: {
    requestId: { type: "string" };
    dryRun: { type: "boolean" };
    confirmToken: { type: "string" };
  };
  required: Array<"requestId" | "dryRun" | "confirmToken">;
  additionalProperties: true;
};

const TOOL_PARAMETERS_SCHEMA: ToolParametersSchema = {
  type: "object",
  properties: {
    requestId: { type: "string" },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  required: ["requestId", "dryRun", "confirmToken"],
  additionalProperties: true,
};

function ensureDevEnabled(): void {
  const enabled =
    process.env.COCALC_CONTROL_AGENT_DEV === "1" ||
    process.env.COCALC_CONTROL_AGENT_DEV === "true";
  if (!enabled) {
    throw Error("control agent dev API is disabled");
  }
}

async function ensureApiKey(): Promise<void> {
  const { openai_api_key } = await getServerSettings();
  if (!openai_api_key) {
    throw Error("openai_api_key is not configured in server settings");
  }
  setDefaultOpenAIKey(openai_api_key);
  setTracingExportApiKey(openai_api_key);
}

function normalizeDryRun(dryRun?: boolean): boolean {
  return dryRun === true;
}

function formatUsage(usage: any): Record<string, number> | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    requests: usage.requests ?? 0,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

function toLogString(value: unknown, maxLength = 1200): string {
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }
  if (value == null) {
    return "";
  }
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}…` : raw;
}

function attachDevLogging(agent: Agent<any, any>, runId: string): void {
  agent.on("agent_start", (ctx, activeAgent) => {
    logger.debug("controlAgentDev agent_start", {
      runId,
      agent: activeAgent?.name,
      usage: formatUsage(ctx?.usage),
    });
  });
  agent.on("agent_end", (ctx, output) => {
    logger.debug("controlAgentDev agent_end", {
      runId,
      usage: formatUsage(ctx?.usage),
      output: toLogString(output),
    });
  });
  agent.on("agent_tool_start", (ctx, toolDef, { toolCall }) => {
    const args =
      toolCall?.type === "function_call" ? toolCall.arguments : undefined;
    logger.debug("controlAgentDev tool_start", {
      runId,
      tool: toolDef?.name,
      args: toLogString(args),
      usage: formatUsage(ctx?.usage),
    });
  });
  agent.on("agent_tool_end", (ctx, toolDef, result, { toolCall }) => {
    const args =
      toolCall?.type === "function_call" ? toolCall.arguments : undefined;
    logger.debug("controlAgentDev tool_end", {
      runId,
      tool: toolDef?.name,
      args: toLogString(args),
      result: toLogString(result),
      usage: formatUsage(ctx?.usage),
    });
  });
  agent.on("agent_handoff", (ctx, nextAgent) => {
    logger.debug("controlAgentDev handoff", {
      runId,
      next: nextAgent?.name,
      usage: formatUsage(ctx?.usage),
    });
  });
}

function toText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((entry: any) => {
        if (!entry || typeof entry !== "object") {
          return "";
        }
        if (typeof entry.text === "string") {
          return entry.text;
        }
        if (typeof entry.refusal === "string") {
          return entry.refusal;
        }
        return "";
      })
      .filter((value) => value);
    return parts.join("\n");
  }
  if (content == null) {
    return "";
  }
  return JSON.stringify(content);
}

function appendTranscript(
  transcript: ControlAgentTranscriptItem[],
  item: any,
) {
  if (item?.role === "user") {
    transcript.push({ role: "user", content: toText(item.content) });
    return;
  }
  if (item?.role === "assistant") {
    transcript.push({ role: "assistant", content: toText(item.content) });
    return;
  }
  if (item?.role === "system") {
    transcript.push({ role: "system", content: toText(item.content) });
    return;
  }
  if (item?.type === "function_call") {
    transcript.push({
      role: "tool",
      name: item.name,
      callId: item.callId,
      content: item.arguments ?? "",
    });
    return;
  }
  if (item?.type === "function_call_result") {
    transcript.push({
      role: "tool",
      name: item.name,
      callId: item.callId,
      content: toText(item.output),
    });
  }
}

function buildToolInstructions(tools: ControlAgentToolDefinition[]): string {
  const lines = tools.map((toolDef) => `- ${toolDef.name}: ${toolDef.description}`);
  return lines.join("\n");
}

function createTool(
  name: ControlAgentToolName,
  description: string,
  execute: (input: Record<string, unknown>) => Promise<unknown>,
) {
  return tool({
    name,
    description,
    parameters: TOOL_PARAMETERS_SCHEMA,
    strict: false,
    execute,
  });
}

export async function controlAgentDev({
  account_id,
  message,
  maxTurns,
  model,
  dryRun,
}: {
  account_id?: string;
  message: string;
  maxTurns?: number;
  model?: string;
  dryRun?: boolean;
}): Promise<ControlAgentDevResponse> {
  ensureDevEnabled();
  await ensureApiKey();
  if (!account_id) {
    throw Error("account_id is required");
  }
  if (!message || typeof message !== "string") {
    throw Error("message is required");
  }

  if (process.env.COCALC_CONTROL_AGENT_TRACE !== "1") {
    setTracingDisabled(true);
  }

  const context: ControlAgentContext = {
    environment: "full",
    actor: { accountId: account_id },
  };
  const runner = createFullControlAgentRunner({ context });
  const toolDefs = await runner.listTools();
  const dryRunEnabled = normalizeDryRun(dryRun);
  const runId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tools = toolDefs.map((def) =>
    createTool(def.name, def.description, async (input) => {
      const requestId =
        typeof input.requestId === "string" && input.requestId
          ? input.requestId
          : `dev-${Date.now()}`;
      const payload = {
        ...input,
        requestId,
        ...(dryRunEnabled ? { dryRun: true } : {}),
      } as Record<string, unknown>;
      return runner.executeTool({ name: def.name, input: payload });
    }),
  );

  const instructions = [
    "You are the CoCalc control-plane dev agent.",
    "Use tools when needed to satisfy requests.",
    "Always include requestId, dryRun, and confirmToken when calling tools.",
    "Use an empty string for confirmToken when no confirmation token is available.",
    "If a tool returns needs_confirmation, ask the user to confirm using the token.",
    "Available tools:",
    buildToolInstructions(toolDefs),
  ].join("\n");

  const agent = new Agent({
    name: "CoCalc Control Agent (Dev)",
    instructions,
    tools,
    ...(model ? { model } : {}),
  });

  attachDevLogging(agent, runId);
  logger.debug("controlAgentDev run", {
    runId,
    account_id,
    maxTurns,
    model,
    dryRun,
    tools: toolDefs.map((def) => def.name),
  });
  const result = await run(agent, message, {
    maxTurns,
  });
  const transcript: ControlAgentTranscriptItem[] = [
    { role: "user", content: message },
  ];
  for (const item of result.output ?? []) {
    appendTranscript(transcript, item);
  }
  return {
    transcript,
    finalOutput: result.finalOutput,
    lastResponseId: result.lastResponseId,
  };
}
