import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
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
    };

export type AcpStreamHandler = (
  payload?: AcpStreamPayload | null,
) => Promise<void>;

export interface AcpEvaluateRequest {
  account_id: string;
  prompt: string;
  session_id?: string;
  stream: AcpStreamHandler;
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

export class CodexAcpAgent implements AcpAgent {
  private readonly child: ChildProcess;
  private readonly connection: ClientSideConnection;
  private readonly handler: CodexClientHandler;
  private sessionId: string;
  private running = false;

  private constructor(options: {
    child: ChildProcess;
    connection: ClientSideConnection;
    handler: CodexClientHandler;
    sessionId: string;
  }) {
    this.child = options.child;
    this.connection = options.connection;
    this.handler = options.handler;
    this.sessionId = options.sessionId;
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

    const newSession = await connection.newSession({
      cwd: options.cwd ?? process.cwd(),
      mcpServers: [],
    });

    return new CodexAcpAgent({
      child,
      connection,
      handler,
      sessionId: newSession.sessionId,
    });
  }

  async evaluate({ prompt, stream }: AcpEvaluateRequest): Promise<void> {
    if (this.running) {
      throw new Error("ACP agent is already processing a request");
    }
    this.running = true;
    this.handler.setStream(stream);

    try {
      const request: PromptRequest = {
        sessionId: this.sessionId,
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
        threadId: this.sessionId,
      });
    } finally {
      this.handler.clearStream();
      this.running = false;
    }
  }

  async dispose(): Promise<void> {
    this.child.kill();
    await this.connection.closed;
  }
}
