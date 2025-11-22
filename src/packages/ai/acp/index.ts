import { randomUUID } from "node:crypto";
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
  PromptRequest,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk/dist/schema";
import type { CodexSessionConfig } from "@cocalc/util/ai/codex";

export type AcpStreamUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

export type AcpThinkingEvent = {
  type: "thinking";
  text: string;
};

export type AcpMessageEvent = {
  type: "message";
  text: string;
};

export type AcpStreamEvent = AcpThinkingEvent | AcpMessageEvent;

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

class CodexClientHandler implements Client {
  private stream?: AcpStreamHandler;
  private lastResponse = "";

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
    if (!this.stream) return;
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
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
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
    if (this.running) {
      throw new Error("ACP agent is already processing a request");
    }
    this.running = true;
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
      await this.connection.prompt(request);
      await stream({
        type: "summary",
        finalResponse: this.handler.getFinalResponse(),
        threadId: session_id ?? session.sessionId,
      });
    } finally {
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
