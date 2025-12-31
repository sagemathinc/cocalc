import type {
  AcpStreamUsage as SharedAcpStreamUsage,
  AcpStreamEvent as SharedAcpStreamEvent,
  AcpStreamPayload as SharedAcpStreamPayload,
  AcpChatContext,
} from "@cocalc/conat/ai/acp/types";
import type { CodexSessionConfig } from "@cocalc/util/ai/codex";

export type AcpStreamUsage = SharedAcpStreamUsage;
export type AcpStreamEvent = SharedAcpStreamEvent;
export type AcpStreamPayload = SharedAcpStreamPayload;

export type CommandOutput = string | Iterable<string> | AsyncIterable<string>;

export interface CommandHandlerContext {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  limit?: number;
}

export interface CommandHandlerResult {
  output?: CommandOutput;
  exitCode?: number;
  signal?: string;
}

export type CustomCommandHandler = (
  ctx: CommandHandlerContext,
) => Promise<CommandHandlerResult>;

export type AcpStreamHandler = (
  payload?: AcpStreamPayload | null,
) => Promise<void>;

export interface AcpEvaluateRequest {
  account_id: string;
  prompt: string;
  session_id?: string;
  stream: AcpStreamHandler;
  config?: CodexSessionConfig;
  chat?: AcpChatContext;
}

export interface AcpAgent {
  evaluate(request: AcpEvaluateRequest): Promise<void>;
  dispose?(): Promise<void>;
}
