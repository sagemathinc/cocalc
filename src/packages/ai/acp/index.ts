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

export type AcpStreamEvent =
  | AcpThinkingEvent
  | AcpMessageEvent
  | AcpDiffEvent;

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

class CodexClientHandler implements TerminalClient {
  private stream?: AcpStreamHandler;
  private lastResponse = "";
  private latestUsage?: AcpStreamUsage;
  private fileSnapshots = new Map<string, string>();
  private terminals = new Map<
    string,
    {
      child: ChildProcess;
      output: string;
      truncated: boolean;
      exitStatus?: TerminalExitStatus;
      waiters: Array<(status: TerminalExitStatus) => void>;
      limit?: number;
    }
  >();

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
    await this.emitDiffEvent(absolute, previous, content);
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
    const envVars: NodeJS.ProcessEnv = {
      ...process.env,
    };
    for (const variable of env ?? []) {
      envVars[variable.name] = variable.value;
    }
    const child = spawn(command, args ?? [], {
      cwd: cwd ?? process.cwd(),
      env: envVars,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const state = {
      child,
      output: "",
      truncated: false,
      exitStatus: undefined as TerminalExitStatus | undefined,
      waiters: [] as Array<(status: TerminalExitStatus) => void>,
      limit: outputByteLimit != null ? Number(outputByteLimit) : undefined,
    };

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      state.output += text;
      if (state.limit != null && state.output.length > state.limit) {
        state.output = state.output.slice(state.output.length - state.limit);
        state.truncated = true;
      }
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
    });

    this.terminals.set(terminalId, state);
    return {
      terminalId,
    };
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
    state.child.kill();
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
    state.child.kill();
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

  private async emitDiffEvent(
    path: string,
    previous?: string,
    next?: string,
  ): Promise<void> {
    if (!this.stream || previous == null || next == null) {
      return;
    }
    if (previous === next) return;
    const patch = make_patch(previous, next);
    if (!patch.length) return;
    await this.stream({
      type: "event",
      event: {
        type: "diff",
        path,
        patch,
      },
    });
  }
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

    const HOME = process.env.COCALC_ORIGINAL_HOME ?? process.env.HOME;
    const child = spawn(binary, [], {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, HOME, ...options.env },
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

    const handler = new CodexClientHandler();
    const connection = new ClientSideConnection(() => handler, stream);

    await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
        terminal: true,
      },
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
    if (session == null || session.cwd !== cwd) {
      session = await this.createSession(cwd);
      this.sessions.set(normalizedKey, session);
    }
    await this.applySessionConfig(session, config);
    return session;
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
