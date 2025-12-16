/*
Codex ACP client (session orchestration only).

This file owns the lifecycle of the codex-acp child process, the ACP
JSON-RPC connection, and session caching (mode/model selection, cwd,
interrupt). All tool/terminal/file handling lives in codex-handler.ts
and is injected via the CodexClientHandler. Keeping the concerns split
lets us swap adapters (local vs container) without touching session
plumbing.

NOTE: Set COCALC_ACP_MAX_SESSIONS to a number to cause codex-acp to
limit the number of sessions in memory at once, to avoid using too
much RAM.
*/

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
} from "@agentclientprotocol/sdk";
import type { PromptRequest } from "@agentclientprotocol/sdk/dist/schema";

import getLogger from "@cocalc/backend/logger";
import {
  resolveCodexSessionMode,
  type CodexSessionConfig,
} from "@cocalc/util/ai/codex";
import type {
  CustomCommandHandler,
  AcpEvaluateRequest,
  AcpAgent,
  ApprovalDecision,
} from "./types";
import { CodexClientHandler } from "./codex-handler";
import type {
  FileAdapter,
  TerminalAdapter,
  PathResolver,
  PathResolution,
} from "./adapters";

const logger = getLogger("ai:acp");

const FILE_LINK_GUIDANCE =
  "When referencing workspace files, output markdown links relative to the project root so they stay clickable in CoCalc, e.g., foo.py -> [foo.py](./foo.py) (no backticks around the link). For images use ![](./image.png).";

const toPosix = (p: string): string => p.replace(/\\/g, "/");

function defaultPathResolver(workspaceRoot: string): PathResolver {
  const root = path.resolve(workspaceRoot);
  return {
    resolve(filePath: string): PathResolution {
      const absolute = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(root, filePath);
      const relRaw = path.relative(root, absolute);
      const relative = relRaw ? toPosix(relRaw) : ".";
      return {
        absolute,
        relative: relative.startsWith("..") ? undefined : relative || ".",
        workspaceRoot: root,
      };
    },
  };
}

interface CodexAcpAgentOptions {
  binaryPath?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  sessionPersistPath?: string;
  disableSessionPersist?: boolean;
  commandHandlers?: Record<string, CustomCommandHandler>;
  useNativeTerminal?: boolean;
  fileAdapter?: FileAdapter;
  terminalAdapter?: TerminalAdapter;
  pathResolver?: PathResolver;
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
    const useNativeTerminal = options.useNativeTerminal === true;
    const workspaceRoot = path.resolve(options.cwd ?? process.cwd());
    if (!options.fileAdapter || !options.terminalAdapter) {
      throw new Error(
        "fileAdapter and terminalAdapter must be provided when creating CodexAcpAgent",
      );
    }
    const adapters = {
      fileAdapter: options.fileAdapter,
      terminalAdapter: options.terminalAdapter,
      pathResolver: options.pathResolver ?? defaultPathResolver(workspaceRoot),
    };

    const args: string[] = [];
    if (options.disableSessionPersist) {
      args.push("--no-session-persist");
    } else if (options.sessionPersistPath) {
      args.push("--session-persist", options.sessionPersistPath);
    }
    if (useNativeTerminal) {
      args.push("--native-shell");
    }
    const approvalPolicy =
      process.env.COCALC_ACP_APPROVAL_POLICY ?? "on-request";
    if (approvalPolicy) {
      args.push("-c", `approval_policy="${approvalPolicy}"`);
    }

    const HOME = process.env.COCALC_ORIGINAL_HOME ?? process.env.HOME;
    // Do not set cwd here: agents may serve multiple sessions with different
    // working directories, and container-mode paths (e.g. "/root") are invalid
    // on the host running codex-acp. Let the process inherit the host cwd; the
    // session-specific working directory is handled per request.
    const child = spawn(binary, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HOME, ...options.env },
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });

    // Capture stderr from the child so ACP noise doesn't go to the main console.
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.trim().length === 0) return;
      logger.warn("acp.child.stderr", { text: text.trimEnd() });
    });
    child.stderr?.on("error", (err) => {
      logger.warn("acp.child.stderr_error", { err });
    });

    const output = Writable.toWeb(
      child.stdin,
    ) as unknown as WritableStream<Uint8Array>;
    const input = Readable.toWeb(
      child.stdout,
    ) as unknown as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(output, input);

    const handler = new CodexClientHandler({
      commandHandlers:
        !useNativeTerminal && options.commandHandlers
          ? new Map(Object.entries(options.commandHandlers))
          : undefined,
      captureToolCalls: useNativeTerminal,
      workspaceRoot,
      fileAdapter: adapters.fileAdapter,
      terminalAdapter: adapters.terminalAdapter,
      pathResolver: adapters.pathResolver,
    });
    const connection = new ClientSideConnection(() => handler, stream);

    const clientCapabilities = {
      fs: {
        readTextFile: true,
        writeTextFile: true,
      },
      terminal: !useNativeTerminal,
    };
    logger.debug("acp.initialize", { clientCapabilities });

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
    logger.debug("acp.prompt.start", {
      session: session_id,
    });
    if (this.running) {
      throw new Error("ACP agent is already processing a request");
    }
    this.running = true;
    this.handler.resetUsage();
    const key = session_id ?? CodexAcpAgent.DEFAULT_SESSION_KEY;
    const session = await this.ensureSession(key, config);
    this.handler.setWorkspaceRoot(session.cwd);
    this.handler.setStream(stream);

    try {
      const isSlashCommand = /^\s*\/\w+/.test(prompt);
      const promptText = isSlashCommand
        ? prompt
        : `${FILE_LINK_GUIDANCE}\n\n${prompt}`;
      const request: PromptRequest = {
        sessionId: session.sessionId,
        prompt: [
          {
            type: "text",
            // Prepend guidance so file mentions become clickable links in CoCalc,
            // but leave slash-commands (e.g. /compact) untouched so Codex ACP
            // can intercept them.
            text: promptText,
          },
        ],
      };
      logger.debug("acp.prompt.send", {
        sessionId: session.sessionId,
        bytes: prompt.length,
      });
      await this.connection.prompt(request);
      // If we saw live usage updates, include the latest in the summary.
      const usage = this.handler.consumeLatestUsage();
      await stream({
        type: "summary",
        finalResponse: this.handler.getFinalResponse(),
        threadId: session.sessionId,
        usage: usage ?? undefined,
      });
    } finally {
      logger.debug("acp.prompt.end", {
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
    logger.debug("acp.session.ensure", {
      sessionKey: normalizedKey,
      cwd,
      configWorkspace: config?.workingDirectory,
    });
    let session = this.sessions.get(normalizedKey);
    if (session == null && config?.sessionId) {
      session = this.findSessionById(config.sessionId);
    }
    if (session == null || session.cwd !== cwd) {
      session =
        (await this.tryResumeSession(cwd, config)) ??
        (await this.createSession(cwd));
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
    logger.debug("acp.session.new", { cwd });
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
      logger.info("acp.session.resume", { sessionId: target });
      return {
        sessionId: target,
        cwd,
        modelId: response.models?.currentModelId ?? undefined,
        modeId: response.modes?.currentModeId ?? undefined,
      };
    } catch (err) {
      logger.warn("acp.session.resume_failed", { sessionId: target, err });
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
    return resolveCodexSessionMode(config);
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

  resolveApproval(decision: ApprovalDecision): boolean {
    return this.handler.resolveApprovalDecision(decision);
  }

  async interrupt(threadId: string): Promise<boolean> {
    const session = this.sessions.get(threadId);
    if (!session) {
      return false;
    }
    try {
      this.handler.interruptSession(session.sessionId);
      await this.connection.cancel({ sessionId: session.sessionId });
      return true;
    } catch (err) {
      logger.warn("acp.session.interrupt_failed", { threadId, err });
      return false;
    }
  }

  async dispose(): Promise<void> {
    this.child.kill();
    await this.connection.closed;
  }
}

// Exposed for tests so we can validate terminal routing and workspace handling.
export { CodexClientHandler };
