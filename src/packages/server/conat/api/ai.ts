/*
Dev-only control-agent API for quick end-to-end testing.
*/

import { Agent, run, setTracingDisabled, tool } from "@openai/agents";
import type {
  ControlAgentDevResponse,
  ControlAgentTranscriptItem,
} from "@cocalc/conat/hub/api/ai";
import type {
  ControlAgentToolDefinition,
  ControlAgentToolName,
} from "@cocalc/ai/control-agent/tools";
import { createFullControlAgentRunner } from "@cocalc/server/control-agent";
import type { ControlAgentContext } from "@cocalc/ai/control-agent";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("control-agent:dev");

const TOOL_PARAMETERS_SCHEMA = {
  type: "object",
  required: ["requestId"],
  properties: {
    requestId: { type: "string" },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  additionalProperties: true,
} as const;

function ensureDevEnabled(): void {
  const enabled =
    process.env.COCALC_CONTROL_AGENT_DEV === "1" ||
    process.env.COCALC_CONTROL_AGENT_DEV === "true";
  if (!enabled) {
    throw Error("control agent dev API is disabled");
  }
}

function ensureApiKey(): void {
  if (!process.env.OPENAI_API_KEY) {
    throw Error("OPENAI_API_KEY is required for control agent dev API");
  }
}

function normalizeDryRun(dryRun?: boolean): boolean {
  return dryRun === true;
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
  ensureApiKey();
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
    "Always include a requestId when calling tools.",
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

  logger.debug("controlAgentDev run", { account_id, maxTurns, model, dryRun });
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
