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
import { randomUUID } from "node:crypto";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
} from "@agentclientprotocol/sdk";
import type { PromptRequest } from "@agentclientprotocol/sdk/dist/schema";
import { argsJoin } from "@cocalc/util/args";
import { join } from "node:path";

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
import type { FileAdapter, TerminalAdapter } from "./adapters";

const logger = getLogger("ai:acp:codex");

const FILE_LINK_GUIDANCE =
  "When referencing workspace files, output markdown links relative to the project root so they stay clickable in CoCalc, e.g., foo.py -> [foo.py](./foo.py) (no backticks around the link). For images use ![](./image.png).";

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
  displayPathRewriter?: (text: string) => string;
}

type SessionState = {
  sessionId: string;
  cwdContainer: string;
  cwdHost: string;
  cwd?: string;
  modelId?: string;
  modeId?: string;
};

export class CodexAcpAgent implements AcpAgent {
  private readonly child: ChildProcess;
  private readonly connection: ClientSideConnection;
  private readonly handler: CodexClientHandler;
  // Track in-flight turns per session so different sessions can run in parallel.
  private readonly runningSessions = new Set<string>();
  private readonly sessions = new Map<string, SessionState>();
  private exitNotified = false;
  private readonly exitHandlers = new Set<
    (code: number | null, signal: NodeJS.Signals | null) => void
  >();
  private static readonly DEFAULT_SESSION_KEY = "__default__";

  private constructor(options: {
    child: ChildProcess;
    connection: ClientSideConnection;
    handler: CodexClientHandler;
  }) {
    this.child = options.child;
    this.connection = options.connection;
    this.handler = options.handler;
    if (typeof this.child.on == "function") { // needed just for unit tests
      this.child.on("exit", (code, signal) => {
        this.notifyExit(code, signal);
      });
      this.child.on("error", (err) => {
        logger.warn("codex-acp process error", err);
        this.notifyExit(null, null);
      });
    }
  }

  static async create(
    options: CodexAcpAgentOptions = {},
  ): Promise<CodexAcpAgent> {
    const binary =
      options.binaryPath ?? process.env.COCALC_ACP_AGENT_BIN ?? "codex-acp";
    const podmanImage = process.env.COCALC_ACP_PODMAN_IMAGE;
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
      workspaceRoot,
    };

    const args: string[] = [];
    let childCmd = binary;
    let childEnv = { ...process.env, ...options.env };

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

    if (podmanImage) {
      // Run codex-acp inside a rootless podman container for isolation.
      const sessionDirHost =
        options.sessionPersistPath ??
        path.join(process.cwd(), "data/codex-sessions");
      const sessionDirContainer = "/state";
      // Rebuild args so codex-acp sees the container path.
      const codexArgs: string[] = [];
      if (options.disableSessionPersist) {
        codexArgs.push("--no-session-persist");
      } else {
        codexArgs.push("--session-persist", sessionDirContainer);
      }
      if (useNativeTerminal) {
        codexArgs.push("--native-shell");
      }
      if (approvalPolicy) {
        codexArgs.push("-c", `approval_policy="${approvalPolicy}"`);
      }

      const name = `codex-acp-${randomUUID().slice(0, 8)}`;
      const podmanArgs: string[] = [
        "run",
        "--rm",
        "-i",
        "--name",
        name,
        "--network",
        process.env.COCALC_ACP_PODMAN_NETWORK ?? "slirp4netns",
        "-v",
        `${sessionDirHost}:${sessionDirContainer}:rw`,
        // make host auth available
        // TODO: this may only be for development
        "-v",
        `${join(process.env.HOME ?? "", ".codex")}:/root/.codex:rw`,
        "-e",
        "HOME=/root",
        "-w",
        "/root",
      ];

      // Pass through select env vars (OpenAI/Anthropic) to the container.
      const passthroughKeys = Object.keys(process.env).filter((k) =>
        /^(OPENAI_|ANTHROPIC_)/.test(k),
      );
      for (const key of passthroughKeys) {
        const val = process.env[key];
        if (val != null) {
          podmanArgs.push("-e", `${key}=${val}`);
        }
      }
      // Allow additional env overrides.
      if (options.env) {
        for (const [k, v] of Object.entries(options.env)) {
          if (v != null) {
            podmanArgs.push("-e", `${k}=${v}`);
          }
        }
      }

      podmanArgs.push(podmanImage, ...codexArgs);
      childCmd = "podman";
      args.length = 0;
      args.push(...podmanArgs);
      // env for the podman client process only.
      childEnv = { ...process.env };
    }

    const HOME = process.env.COCALC_ORIGINAL_HOME ?? process.env.HOME;

    logger.debug(`${childCmd}`, argsJoin(args), { HOME });

    // Do not set cwd here: agents may serve multiple sessions with different
    // working directories, and container-mode paths (e.g. "/root") are invalid
    // on the host running codex-acp. Let the process inherit the host cwd; the
    // session-specific working directory is handled per request.
    const child = spawn(childCmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...childEnv, HOME },
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });

    if (process.env.COCALC_LOG_CODEX_ACP_OUTPUT) {
      child.stdout?.on("data", (chunk) => {
        const text = chunk.toString()?.trim();
        if (!text) return;
        logger.debug("acp.child.stdout", text);
      });
    }

    // Capture stderr from the child so ACP noise doesn't go to the main console.
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.trim().length === 0) return;
      logger.warn("acp.child.stderr", text);
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

  /**
   * Register a callback that fires when the underlying codex-acp process exits
   * (or errors). Useful for supervisors to restart the agent.
   */
  onExit(
    fn: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): void {
    this.exitHandlers.add(fn);
  }

  private notifyExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.exitNotified) return;
    this.exitNotified = true;
    logger.warn("codex-acp process exited", { code, signal });
    for (const fn of this.exitHandlers) {
      try {
        fn(code, signal);
      } catch (err) {
        logger.debug("codex-acp exit handler failed", err);
      }
    }
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
    const sessionKeyNormalized = this.normalizeSessionKey(session_id);
    if (this.runningSessions.has(sessionKeyNormalized)) {
      throw new Error("ACP agent is already processing this session");
    }
    this.handler.resetUsage();
    const session = await this.ensureSession(sessionKeyNormalized, config);
    const runningKey = session.sessionId ?? sessionKeyNormalized;
    if (this.runningSessions.has(runningKey)) {
      throw new Error("ACP agent is already processing this session");
    }
    this.runningSessions.add(runningKey);
    this.handler.setWorkspaceRoot(session.cwdContainer);
    this.handler.setStream(stream);

    let exitTriggered = false;
    let exitHandler:
      | ((c: number | null, s: NodeJS.Signals | null) => void)
      | null = null;
    const exitPromise = new Promise<void>((resolve) => {
      exitHandler = async (code, signal) => {
        if (exitTriggered) return;
        exitTriggered = true;
        const err = new Error(
          `codex agent exited${code != null ? ` (code ${code})` : ""}${
            signal ? ` (signal ${signal})` : ""
          }`,
        );
        try {
          await stream({
            type: "error",
            error: err.message,
          });
        } catch (e) {
          logger.warn("failed to stream exit error", e);
        }
        resolve();
      };
      this.onExit(exitHandler!);
    });

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
      await Promise.race([this.connection.prompt(request), exitPromise]);
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
      this.runningSessions.delete(runningKey);
      this.runningSessions.delete(sessionKeyNormalized);
      if (exitHandler) {
        this.exitHandlers.delete(exitHandler);
      }
    }
  }

  private normalizeSessionKey(key?: string): string {
    const trimmed = key?.trim();
    return trimmed && trimmed.length > 0
      ? trimmed
      : CodexAcpAgent.DEFAULT_SESSION_KEY;
  }

  private resolveWorkingDirectory(config?: CodexSessionConfig): {
    container: string;
    host: string;
  } {
    const target = config?.workingDirectory ?? ".";
    const base = this.handlerWorkspaceRoot();
    const absolute = path.isAbsolute(target)
      ? path.normalize(target)
      : path.resolve(base, target);
    return {
      container: absolute,
      host: absolute,
    };
  }

  private handlerWorkspaceRoot(): string {
    // best-effort; handler tracks its workspace root internally
    return (this.handler as any)?.["workspaceRoot"] ?? process.cwd();
  }

  private async ensureSession(
    sessionKey: string,
    config?: CodexSessionConfig,
  ): Promise<SessionState> {
    const normalizedKey = this.normalizeSessionKey(sessionKey);
    const { container: cwdContainer, host: cwdHost } =
      this.resolveWorkingDirectory(config);
    logger.debug("acp.session.ensure", {
      sessionKey: normalizedKey,
      cwd: cwdContainer,
      hostCwd: cwdHost,
      configWorkspace: config?.workingDirectory,
    });
    let session = this.sessions.get(normalizedKey);
    if (session == null && config?.sessionId) {
      session = this.findSessionById(config.sessionId);
    }
    if (
      session == null ||
      session.cwdContainer !== cwdContainer ||
      session.cwdHost !== cwdHost
    ) {
      session =
        (await this.tryResumeSession(cwdHost, config)) ??
        (await this.createSession({ cwdContainer, cwdHost }));
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

  private async createSession({
    cwdContainer,
    cwdHost,
  }: {
    cwdContainer: string;
    cwdHost: string;
  }): Promise<SessionState> {
    logger.debug("acp.session.new", { cwdHost, cwdContainer });
    const response = await this.connection.newSession({
      cwd: cwdHost,
      mcpServers: [],
    });
    return {
      sessionId: response.sessionId,
      cwdContainer,
      cwdHost,
      cwd: cwdHost,
      modelId: response.models?.currentModelId ?? undefined,
      modeId: response.modes?.currentModeId ?? undefined,
    };
  }

  private async tryResumeSession(
    cwdHost: string,
    config?: CodexSessionConfig,
  ): Promise<SessionState | undefined> {
    const target = config?.sessionId?.trim();
    if (!target) return undefined;
    try {
      const response = await this.connection.loadSession({
        sessionId: target,
        cwd: cwdHost,
        mcpServers: [],
      });
      logger.info("acp.session.resume", { sessionId: target });
      return {
        sessionId: target,
        cwdContainer: cwdHost,
        cwdHost,
        cwd: cwdHost,
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
