import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { Writable, Readable } from "node:stream";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
} from "@agentclientprotocol/sdk";
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  KillTerminalCommandRequest,
  KillTerminalResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  PromptRequest,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  TerminalExitStatus,
  TerminalOutputRequest,
  TerminalOutputResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@agentclientprotocol/sdk/dist/schema";

import getLogger from "@cocalc/backend/logger";
import { make_patch } from "@cocalc/util/dmp";
import type { CompressedPatch } from "@cocalc/util/dmp";
import type { CodexSessionConfig } from "@cocalc/util/ai/codex";

const log = getLogger("ai:acp");
const MAX_TERMINAL_STREAM_CHARS = 4000;

export type AcpStreamUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
  model_context_window?: number;
};

export type AcpThinkingEvent = {
  type: "thinking";
  text: string;
};

export type AcpMessageEvent = {
  type: "message";
  text: string;
};

export type AcpDiffEvent = {
  type: "diff";
  path: string;
  patch: CompressedPatch;
};

export type AcpFileEvent = {
  type: "file";
  path: string;
  operation: "read" | "write";
  bytes?: number;
  truncated?: boolean;
  line?: number;
  limit?: number;
  existed?: boolean;
};

export type AcpTerminalEvent = {
  type: "terminal";
  terminalId: string;
  phase: "start" | "data" | "exit";
  command?: string;
  args?: string[];
  cwd?: string;
  chunk?: string;
  truncated?: boolean;
  exitStatus?: TerminalExitStatus;
  output?: string;
};

export type AcpStreamEvent =
  | AcpThinkingEvent
  | AcpMessageEvent
  | AcpDiffEvent
  | AcpFileEvent
  | AcpTerminalEvent;

export type CommandOutput =
  | string
  | Iterable<string>
  | AsyncIterable<string>;

export type CommandHandlerContext = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  limit?: number;
};

export type CommandHandlerResult = {
  output?: CommandOutput;
  exitCode?: number;
  signal?: string;
};

export type CustomCommandHandler = (
  ctx: CommandHandlerContext,
) => Promise<CommandHandlerResult>;

export type AcpStreamPayload =
  | {
      type: "event";
      event: AcpStreamEvent;
    }
  | {
      type: "summary";
      finalResponse: string;
      usage?: AcpStreamUsage | null;
      threadId?: string | null;
    }
  | {
      type: "error";
      error: string;
    };

export type AcpStreamHandler = (
  payload?: AcpStreamPayload | null,
) => Promise<void>;

export interface AcpEvaluateRequest {
  account_id: string;
  prompt: string;
  session_id?: string;
  stream: AcpStreamHandler;
  config?: CodexSessionConfig;
}

export interface AcpAgent {
  evaluate(request: AcpEvaluateRequest): Promise<void>;
  dispose?(): Promise<void>;
}

/**
 * EchoAgent is a placeholder implementation that mimics an ACP agent.
 * It emits a short thinking event and a summary containing the user's prompt.
 */
export class EchoAgent implements AcpAgent {
  async evaluate({ prompt, stream }: AcpEvaluateRequest): Promise<void> {
    await stream({
      type: "event",
      event: {
        type: "thinking",
        text: "Analyzing prompt…",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    await stream({
      type: "event",
      event: {
        type: "message",
        text: "Generating response…",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    await stream({
      type: "summary",
      finalResponse: `ACP Echo: ${prompt}`,
      usage: {
        input_tokens: prompt.length,
        output_tokens: prompt.length + 10,
      },
      threadId: randomUUID(),
    });
  }
}

export const echoAgent = new EchoAgent();

interface CodexAcpAgentOptions {
  binaryPath?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  sessionPersistPath?: string;
  disableSessionPersist?: boolean;
  commandHandlers?: Record<string, CustomCommandHandler>;
}

interface TerminalClient extends Client {
  readTextFile(args: ReadTextFileRequest): Promise<ReadTextFileResponse>;
  writeTextFile(args: WriteTextFileRequest): Promise<WriteTextFileResponse>;
  createTerminal(args: CreateTerminalRequest): Promise<CreateTerminalResponse>;
  terminalOutput(args: TerminalOutputRequest): Promise<TerminalOutputResponse>;
  waitForTerminalExit(
    args: WaitForTerminalExitRequest,
  ): Promise<WaitForTerminalExitResponse>;
  killTerminal(args: KillTerminalCommandRequest): Promise<KillTerminalResponse>;
  releaseTerminal(
    args: ReleaseTerminalRequest,
  ): Promise<ReleaseTerminalResponse>;
}

type TerminalState = {
  child?: ChildProcess;
  stop?: () => void;
  output: string;
  truncated: boolean;
  exitStatus?: TerminalExitStatus;
  waiters: Array<(status: TerminalExitStatus) => void>;
  limit?: number;
};

type CodexClientHandlerOptions = {
  commandHandlers?: Map<string, CustomCommandHandler>;
};

class CodexClientHandler implements TerminalClient {
  private stream?: AcpStreamHandler;
  private lastResponse = "";
  private latestUsage?: AcpStreamUsage;
  private fileSnapshots = new Map<string, string>();
  private terminals = new Map<string, TerminalState>();
  private readonly commandHandlers?: Map<string, CustomCommandHandler>;

  constructor(options?: CodexClientHandlerOptions) {
    this.commandHandlers = options?.commandHandlers;
  }

  setStream(stream?: AcpStreamHandler) {
    this.stream = stream;
    this.lastResponse = "";
  }

  clearStream() {
    this.stream = undefined;
  }

  getFinalResponse(): string {
    return this.lastResponse.trim() || "(no response)";
  }

  async requestPermission(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    const option = params.options[0];
    if (option == null) {
      return {
        outcome: {
          outcome: "cancelled",
        },
      };
    }
    return {
      outcome: {
        outcome: "selected",
        optionId: option.optionId,
      },
    };
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    log.debug("acp.sessionUpdate", {
      sessionId: params.sessionId,
      update: params.update.sessionUpdate,
    });
    if (!this.stream) return;
    const usageMeta =
      (params.update as any)?.meta?.token_usage ??
      (params.update as any)?._meta?.token_usage;
    if (usageMeta != null) {
      const usage = mapTokenUsage(usageMeta);
      if (usage) {
        this.latestUsage = usage;
      }
      return;
    }
    const update = params.update;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content?.type === "text") {
          const text = update.content.text;
          this.lastResponse += text;
          await this.stream({
            type: "event",
            event: { type: "message", text },
          });
        }
        break;
      case "agent_thought_chunk":
        if (update.content?.type === "text") {
          await this.stream({
            type: "event",
            event: { type: "thinking", text: update.content.text },
          });
        }
        break;
      default:
        break;
    }
  }

  private resolvePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  }

  async readTextFile({
    path: targetPath,
    limit,
    line,
  }: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    const absolute = this.resolvePath(targetPath);
    log.debug("acp.read_text_file", {
      path: absolute,
      line,
      limit,
    });
    const data = await fs.readFile(absolute, "utf8");
    this.fileSnapshots.set(absolute, data);
    const content =
      line != null || limit != null
        ? sliceByLines(data, line ?? undefined, limit ?? undefined)
        : data;
    log.debug("acp.read_text_file.ok", {
      path: absolute,
      bytes: content.length,
    });
    const truncated =
      content.length !== data.length || (line != null && line > 1);
    await this.emitFileEvent(absolute, {
      operation: "read",
      bytes: content.length,
      truncated,
      line: line ?? undefined,
      limit: limit ?? undefined,
    });
    return { content };
  }

  async writeTextFile({
    path: targetPath,
    content,
  }: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    const absolute = this.resolvePath(targetPath);
    const previous = this.fileSnapshots.get(absolute);
    log.debug("acp.write_text_file", {
      path: absolute,
      bytes: content.length,
    });
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, "utf8");
    this.fileSnapshots.set(absolute, content);
    const emittedDiff = await this.emitDiffEvent(absolute, previous, content);
    if (!emittedDiff) {
      await this.emitFileEvent(absolute, {
        operation: "write",
        bytes: content.length,
        existed: previous != null,
        truncated: false,
      });
    }
    return {};
  }

  async createTerminal({
    sessionId: _sessionId,
    command,
    args,
    env,
    cwd,
    outputByteLimit,
  }: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    const terminalId = randomUUID();
    log.debug("acp.create_terminal", {
      command,
      args,
      cwd,
      terminalId,
    });
    const envVars: NodeJS.ProcessEnv = this.buildEnv(env);
    const limit = outputByteLimit != null ? Number(outputByteLimit) : undefined;
    const customInvocation = this.resolveCustomCommand(command, args ?? []);
    if (customInvocation) {
      await this.startCustomCommand({
        terminalId,
        command: customInvocation.command,
        args: customInvocation.args,
        cwd: cwd ?? process.cwd(),
        env: envVars,
        limit,
        handler: customInvocation.handler,
      });
      return { terminalId };
    }

    const child = spawn(command, args ?? [], {
      cwd: cwd ?? process.cwd(),
      env: envVars,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const state: TerminalState = {
      child,
      output: "",
      truncated: false,
      exitStatus: undefined,
      waiters: [],
      limit,
      stop: () => {
        child.kill();
      },
    };

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      state.output += text;
      if (state.limit != null && state.output.length > state.limit) {
        state.output = state.output.slice(state.output.length - state.limit);
        state.truncated = true;
      }
      void this.emitTerminalEvent(terminalId, {
        phase: "data",
        chunk: text,
        truncated: state.truncated,
      });
    };

    child.stdout?.on("data", handleChunk);
    child.stderr?.on("data", handleChunk);
    child.once("exit", (code, signal) => {
      state.exitStatus = {
        exitCode: code == null ? undefined : Number(code),
        signal: signal ?? undefined,
      };
      for (const waiter of state.waiters) {
        waiter(state.exitStatus);
      }
      state.waiters.length = 0;
      void this.emitTerminalEvent(terminalId, {
        phase: "exit",
        exitStatus: state.exitStatus,
        output: state.output,
        truncated: state.truncated,
      });
    });

    child.once("error", (err) => {
      state.exitStatus = {
        exitCode: undefined,
        signal: err.message,
      };
      for (const waiter of state.waiters) {
        waiter(state.exitStatus);
      }
      state.waiters.length = 0;
      void this.emitTerminalEvent(terminalId, {
        phase: "exit",
        exitStatus: state.exitStatus,
        output: state.output,
        truncated: state.truncated,
      });
    });

    this.terminals.set(terminalId, state);
    await this.emitTerminalEvent(terminalId, {
      phase: "start",
      command,
      args,
      cwd: cwd ?? process.cwd(),
    });
    return {
      terminalId,
    };
  }

  private buildEnv(
    env?: { name: string; value: string }[],
  ): NodeJS.ProcessEnv {
    const envVars: NodeJS.ProcessEnv = {
      ...process.env,
    };
    for (const variable of env ?? []) {
      envVars[variable.name] = variable.value;
    }
    return envVars;
  }

  private resolveCustomCommand(
    command: string,
    args: string[],
  ):
    | { command: string; args: string[]; handler: CustomCommandHandler }
    | undefined {
    if (!this.commandHandlers?.size) {
      return undefined;
    }
    const direct = this.commandHandlers.get(command);
    if (direct) {
      return { command, args, handler: direct };
    }
    const script = this.extractShellScript(command, args);
    if (!script) {
      return undefined;
    }
    const parsed = this.parseCustomScript(script);
    if (!parsed) {
      return undefined;
    }
    const handler = this.commandHandlers.get(parsed.command);
    if (!handler) {
      return undefined;
    }
    return { command: parsed.command, args: parsed.args, handler };
  }

  private extractShellScript(
    command: string,
    args: string[],
  ): string | undefined {
    const shells = new Set([
      "/bin/bash",
      "/bin/sh",
      "/bin/zsh",
      "bash",
      "sh",
      "zsh",
    ]);
    const shellFlags = new Set(["-c", "-lc"]);

    const findScript = (shellArgs: string[]): string | undefined => {
      const idx = shellArgs.findIndex((arg) => shellFlags.has(arg));
      if (idx === -1 || idx + 1 >= shellArgs.length) {
        return undefined;
      }
      return shellArgs[idx + 1];
    };

    if (shells.has(command)) {
      return findScript(args);
    }

    if (command === "/usr/bin/env" || command === "env") {
      const envArgs = [...args];
      while (envArgs.length && envArgs[0].includes("=") && !envArgs[0].startsWith("-")) {
        envArgs.shift();
      }
      if (!envArgs.length) {
        return undefined;
      }
      const nextCommand = envArgs.shift()!;
      if (!shells.has(nextCommand)) {
        return undefined;
      }
      return findScript(envArgs);
    }

    return undefined;
  }

  private parseCustomScript(
    script: string,
  ): { command: string; args: string[] } | undefined {
    const trimmed = script.trim();
    if (!trimmed) return undefined;
    // Extracts the first token as the command and captures everything up to the
    // next shell control character (&, |, ;) as a single argument payload.
    const match = trimmed.match(/^([^\s]+)(?:\s+([^&|;]+))?\s*$/);
    if (!match) return undefined;
    const command = match[1];
    const argText = match[2]?.trim();
    if (!argText) {
      return { command, args: [] };
    }
    return {
      command,
      args: [stripQuotes(argText)],
    };
  }

  private async startCustomCommand({
    terminalId,
    command,
    args,
    cwd,
    env,
    limit,
    handler,
  }: {
    terminalId: string;
    command: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    limit?: number;
    handler: CustomCommandHandler;
  }): Promise<void> {
    const state: TerminalState = {
      output: "",
      truncated: false,
      exitStatus: undefined,
      waiters: [],
      limit,
    };
    const abortController = new AbortController();
    state.stop = () => {
      abortController.abort();
    };
    this.terminals.set(terminalId, state);
    await this.emitTerminalEvent(terminalId, {
      phase: "start",
      command,
      args,
      cwd,
    });

    const emitChunk = (chunk: string) => {
      if (!chunk) return;
      state.output += chunk;
      if (state.limit != null && state.output.length > state.limit) {
        state.output = state.output.slice(state.output.length - state.limit);
        state.truncated = true;
      }
      void this.emitTerminalEvent(terminalId, {
        phase: "data",
        chunk,
        truncated: state.truncated,
      });
    };

    const complete = (status: TerminalExitStatus) => {
      state.exitStatus = status;
      for (const waiter of state.waiters) {
        waiter(status);
      }
      state.waiters.length = 0;
      void this.emitTerminalEvent(terminalId, {
        phase: "exit",
        exitStatus: status,
        output: state.output,
        truncated: state.truncated,
      });
    };

    const run = async () => {
      try {
        const result = await handler({
          command,
          args,
          cwd,
          env,
          limit,
        });
        await this.streamCustomOutput(
          result?.output,
          emitChunk,
          abortController.signal,
        );
        if (abortController.signal.aborted) {
          complete({ exitCode: undefined, signal: "SIGTERM" });
        } else {
          complete({
            exitCode: result?.exitCode ?? 0,
            signal: result?.signal,
          });
        }
      } catch (err) {
        emitChunk(`${err}\n`);
        complete({ exitCode: 1 });
      }
    };

    run().catch((err) => {
      log.error("custom command failed", err);
      emitChunk(`${err}\n`);
      complete({ exitCode: 1, signal: undefined });
    });
  }

  async terminalOutput({
    terminalId,
  }: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    log.debug("acp.terminal_output", { terminalId });
    const state = this.terminals.get(terminalId);
    if (state == null) {
      throw new Error(`Unknown terminal ${terminalId}`);
    }
    return {
      output: state.output,
      truncated: state.truncated,
      exitStatus: state.exitStatus,
    };
  }

  private async streamCustomOutput(
    output: CommandOutput | undefined,
    emit: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!output) return;
    for await (const chunk of toAsyncIterable(output)) {
      if (signal?.aborted) break;
      emit(chunk);
    }
  }

  async waitForTerminalExit({
    terminalId,
  }: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    log.debug("acp.wait_for_terminal_exit", { terminalId });
    const state = this.terminals.get(terminalId);
    if (state == null) {
      throw new Error(`Unknown terminal ${terminalId}`);
    }
    if (state.exitStatus != null) {
      return toWaitResponse(state.exitStatus);
    }
    return await new Promise((resolve) => {
      state.waiters.push((status) => {
        resolve(toWaitResponse(status));
      });
    });
  }

  async killTerminal({
    terminalId,
  }: KillTerminalCommandRequest): Promise<KillTerminalResponse> {
    log.debug("acp.kill_terminal", { terminalId });
    const state = this.terminals.get(terminalId);
    if (state == null) {
      throw new Error(`Unknown terminal ${terminalId}`);
    }
    state.stop?.();
    return {};
  }

  async releaseTerminal({
    terminalId,
  }: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> {
    log.debug("acp.release_terminal", { terminalId });
    const state = this.terminals.get(terminalId);
    if (state == null) {
      return {};
    }
    state.stop?.();
    this.terminals.delete(terminalId);
    return {};
  }

  resetUsage(): void {
    this.latestUsage = undefined;
  }

  consumeLatestUsage(): AcpStreamUsage | undefined {
    const usage = this.latestUsage;
    this.latestUsage = undefined;
    return usage;
  }

  private async emitTerminalEvent(
    terminalId: string,
    payload: Omit<AcpTerminalEvent, "type" | "terminalId">,
  ): Promise<void> {
    if (!this.stream) return;
    const eventPayload: Omit<AcpTerminalEvent, "type" | "terminalId"> = {
      ...payload,
    };
    if (payload.phase === "data" && typeof payload.chunk === "string") {
      const formatted = formatTerminalOutput(payload.chunk);
      if (formatted.truncated) {
        eventPayload.chunk = formatted.text;
      }
    }
    if (payload.phase === "exit" && typeof payload.output === "string") {
      const formatted = formatTerminalOutput(payload.output);
      if (formatted.truncated) {
        eventPayload.output = formatted.text;
      }
    }
    await this.stream({
      type: "event",
      event: {
        type: "terminal",
        terminalId,
        ...eventPayload,
      },
    });
  }

  private async emitDiffEvent(
    path: string,
    previous?: string,
    next?: string,
  ): Promise<boolean> {
    if (!this.stream || previous == null || next == null) {
      return false;
    }
    if (previous === next) return false;
    const patch = make_patch(previous, next);
    if (!patch.length) return false;
    await this.stream({
      type: "event",
      event: {
        type: "diff",
        path,
        patch,
      },
    });
    return true;
  }

  private async emitFileEvent(
    path: string,
    payload: Omit<AcpFileEvent, "type" | "path">,
  ): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "event",
      event: {
        type: "file",
        path,
        ...payload,
      },
    });
  }
}

function isAsyncIterable(value: any): value is AsyncIterable<string> {
  return value != null && typeof value[Symbol.asyncIterator] === "function";
}

function isIterable(value: any): value is Iterable<string> {
  return value != null && typeof value[Symbol.iterator] === "function";
}

async function* toAsyncIterable(
  output: CommandOutput,
): AsyncIterable<string> {
  if (typeof output === "string") {
    yield output;
    return;
  }
  if (isAsyncIterable(output)) {
    for await (const chunk of output) {
      yield chunk;
    }
    return;
  }
  if (isIterable(output)) {
    for (const chunk of output) {
      yield chunk;
    }
    return;
  }
  yield String(output);
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.length) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function formatTerminalOutput(
  text: string,
  limit = MAX_TERMINAL_STREAM_CHARS,
): { text: string; truncated: boolean } {
  if (text.length <= limit) {
    return { text, truncated: false };
  }
  const tail = text.slice(-limit);
  const prefix = `[output truncated: showing last ${limit} of ${text.length} characters]\n`;
  return { text: `${prefix}${tail}`, truncated: true };
}

function mapTokenUsage(payload: any): AcpStreamUsage | undefined {
  if (payload == null || typeof payload !== "object") {
    return undefined;
  }
  const last = payload.last_token_usage ?? {};
  const total = payload.total_token_usage ?? {};
  const usage: AcpStreamUsage = {};
  const setNumber = (value: any): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const input = setNumber(last.input_tokens);
  if (input != null) usage.input_tokens = input;
  const cached = setNumber(last.cached_input_tokens);
  if (cached != null) usage.cached_input_tokens = cached;
  const output = setNumber(last.output_tokens);
  if (output != null) usage.output_tokens = output;
  const reasoning = setNumber(last.reasoning_output_tokens);
  if (reasoning != null) usage.reasoning_output_tokens = reasoning;
  const totalTokens = setNumber(total.total_tokens);
  if (totalTokens != null) usage.total_tokens = totalTokens;
  const contextWindow = setNumber(payload.model_context_window);
  if (contextWindow != null) usage.model_context_window = contextWindow;
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function toWaitResponse(
  status?: TerminalExitStatus,
): WaitForTerminalExitResponse {
  if (status == null) return {};
  const response: WaitForTerminalExitResponse = {};
  if (status.exitCode != null) {
    response.exitCode = status.exitCode;
  }
  if (status.signal != null) {
    response.signal = status.signal;
  }
  return response;
}

function sliceByLines(
  text: string,
  startLine?: number | null,
  limit?: number | null,
): string {
  const normalizedStart =
    startLine != null && startLine > 1 ? Math.floor(startLine) : 1;
  const normalizedLimit =
    limit != null && limit > 0 ? Math.floor(limit) : undefined;
  if (normalizedStart === 1 && normalizedLimit == null) {
    return text;
  }
  if (normalizedLimit === 0) {
    return "";
  }
  let idx = 0;
  let currentLine = 1;
  while (currentLine < normalizedStart && idx < text.length) {
    const next = text.indexOf("\n", idx);
    if (next === -1) {
      return "";
    }
    idx = next + 1;
    currentLine += 1;
  }
  if (currentLine < normalizedStart) {
    return "";
  }
  const startIdx = idx;
  if (normalizedLimit == null) {
    return text.slice(startIdx);
  }
  let remaining = normalizedLimit;
  let endIdx = startIdx;
  while (remaining > 0 && endIdx < text.length) {
    const next = text.indexOf("\n", endIdx);
    if (next === -1) {
      endIdx = text.length;
      break;
    }
    endIdx = next + 1;
    remaining -= 1;
  }
  return text.slice(startIdx, endIdx);
}

type SessionState = {
  sessionId: string;
  cwd: string;
  modelId?: string;
  modeId?: string;
};

export class CodexAcpAgent implements AcpAgent {
  private readonly child: ChildProcess;
  private readonly connection: ClientSideConnection;
  private readonly handler: CodexClientHandler;
  private running = false;
  private readonly sessions = new Map<string, SessionState>();
  private static readonly DEFAULT_SESSION_KEY = "__default__";

  private constructor(options: {
    child: ChildProcess;
    connection: ClientSideConnection;
    handler: CodexClientHandler;
  }) {
    this.child = options.child;
    this.connection = options.connection;
    this.handler = options.handler;
  }

  static async create(
    options: CodexAcpAgentOptions = {},
  ): Promise<CodexAcpAgent> {
    const binary =
      options.binaryPath ?? process.env.COCALC_ACP_AGENT_BIN ?? "codex-acp";

    const args: string[] = [];
    if (options.disableSessionPersist) {
      args.push("--no-session-persist");
    } else if (options.sessionPersistPath) {
      args.push("--session-persist", options.sessionPersistPath);
    }

    const HOME = process.env.COCALC_ORIGINAL_HOME ?? process.env.HOME;
    const child = spawn(binary, args, {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, HOME, ...options.env },
      cwd: options.cwd ?? process.cwd(),
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });

    const output = Writable.toWeb(
      child.stdin,
    ) as unknown as WritableStream<Uint8Array>;
    const input = Readable.toWeb(
      child.stdout,
    ) as unknown as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(output, input);

    const handler = new CodexClientHandler({
      commandHandlers: options.commandHandlers
        ? new Map(Object.entries(options.commandHandlers))
        : undefined,
    });
    const connection = new ClientSideConnection(() => handler, stream);

    const clientCapabilities = {
      fs: {
        readTextFile: true,
        writeTextFile: true,
      },
      terminal: true,
    };
    log.debug("acp.initialize", { clientCapabilities });

    await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities,
    });

    return new CodexAcpAgent({
      child,
      connection,
      handler,
    });
  }

  async evaluate({
    prompt,
    stream,
    session_id,
    config,
  }: AcpEvaluateRequest): Promise<void> {
    log.debug("acp.prompt.start", {
      session: session_id,
    });
    if (this.running) {
      throw new Error("ACP agent is already processing a request");
    }
    this.running = true;
    this.handler.resetUsage();
    const key = session_id ?? CodexAcpAgent.DEFAULT_SESSION_KEY;
    const session = await this.ensureSession(key, config);
    this.handler.setStream(stream);

    try {
      const request: PromptRequest = {
        sessionId: session.sessionId,
        prompt: [
          {
            type: "text",
            text: prompt,
          },
        ],
      };
      log.debug("acp.prompt.send", {
        sessionId: session.sessionId,
        bytes: prompt.length,
      });
      await this.connection.prompt(request);
      const usage = this.handler.consumeLatestUsage();
      await stream({
        type: "summary",
        finalResponse: this.handler.getFinalResponse(),
        threadId: session_id ?? session.sessionId,
        usage: usage ?? undefined,
      });
    } finally {
      log.debug("acp.prompt.end", {
        session: session_id ?? session.sessionId,
      });
      this.handler.clearStream();
      this.running = false;
    }
  }

  private normalizeSessionKey(key?: string): string {
    const trimmed = key?.trim();
    return trimmed && trimmed.length > 0
      ? trimmed
      : CodexAcpAgent.DEFAULT_SESSION_KEY;
  }

  private normalizeWorkingDirectory(config?: CodexSessionConfig): string {
    const dir = config?.workingDirectory ?? process.cwd();
    return path.resolve(dir);
  }

  private async ensureSession(
    sessionKey: string,
    config?: CodexSessionConfig,
  ): Promise<SessionState> {
    const normalizedKey = this.normalizeSessionKey(sessionKey);
    const cwd = this.normalizeWorkingDirectory(config);
    let session = this.sessions.get(normalizedKey);
    if (session == null && config?.sessionId) {
      session = this.findSessionById(config.sessionId);
    }
    if (session == null || session.cwd !== cwd) {
      session = (await this.tryResumeSession(cwd, config)) ?? (await this.createSession(cwd));
      this.sessions.set(normalizedKey, session);
    }
    if (!this.sessions.has(session.sessionId)) {
      this.sessions.set(session.sessionId, session);
    }
    await this.applySessionConfig(session, config);
    return session;
  }

  private findSessionById(sessionId: string): SessionState | undefined {
    for (const state of this.sessions.values()) {
      if (state.sessionId === sessionId) {
        return state;
      }
    }
    return undefined;
  }

  private async createSession(cwd: string): Promise<SessionState> {
    const response = await this.connection.newSession({
      cwd,
      mcpServers: [],
    });
    return {
      sessionId: response.sessionId,
      cwd,
      modelId: response.models?.currentModelId ?? undefined,
      modeId: response.modes?.currentModeId ?? undefined,
    };
  }

  private async tryResumeSession(
    cwd: string,
    config?: CodexSessionConfig,
  ): Promise<SessionState | undefined> {
    const target = config?.sessionId?.trim();
    if (!target) return undefined;
    try {
      const response = await this.connection.loadSession({
        sessionId: target,
        cwd,
        mcpServers: [],
      });
      log.info("acp.session.resume", { sessionId: target });
      return {
        sessionId: target,
        cwd,
        modelId: response.models?.currentModelId ?? undefined,
        modeId: response.modes?.currentModeId ?? undefined,
      };
    } catch (err) {
      log.warn("acp.session.resume_failed", { sessionId: target, err });
      return undefined;
    }
  }

  private async applySessionConfig(
    session: SessionState,
    config?: CodexSessionConfig,
  ): Promise<void> {
    await this.applySessionMode(session, config);
    await this.applySessionModel(session, config);
  }

  private desiredModeId(config?: CodexSessionConfig): string {
    return config?.allowWrite ? "auto" : "read-only";
  }

  private async applySessionMode(
    session: SessionState,
    config?: CodexSessionConfig,
  ): Promise<void> {
    const desiredMode = this.desiredModeId(config);
    if (session.modeId === desiredMode) {
      return;
    }
    await this.connection.setSessionMode({
      sessionId: session.sessionId,
      modeId: desiredMode,
    });
    session.modeId = desiredMode;
  }

  private mapReasoning(
    value?: CodexSessionConfig["reasoning"],
  ): string | undefined {
    if (!value) return undefined;
    if (value === "extra_high") {
      return "xhigh";
    }
    return value;
  }

  private buildModelId(config?: CodexSessionConfig): string | undefined {
    if (!config?.model) {
      return undefined;
    }
    const reasoning = this.mapReasoning(config.reasoning);
    return reasoning ? `${config.model}/${reasoning}` : config.model;
  }

  private async applySessionModel(
    session: SessionState,
    config?: CodexSessionConfig,
  ): Promise<void> {
    const desiredModel = this.buildModelId(config);
    if (!desiredModel || session.modelId === desiredModel) {
      return;
    }
    await this.connection.setSessionModel({
      sessionId: session.sessionId,
      modelId: desiredModel,
    });
    session.modelId = desiredModel;
  }

  async dispose(): Promise<void> {
    this.child.kill();
    await this.connection.closed;
  }
}
