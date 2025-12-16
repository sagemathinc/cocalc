/*
Codex ACP client handler (tools, terminals, file I/O).

This file implements the ACP-side handlers for terminal commands,
file reads/writes, approvals, and live diff/file events. It is used by
the session wrapper in codex.ts and is where adapter logic (local vs
container) will be plugged in. Session orchestration lives in codex.ts;
all tool/file plumbing is here to keep responsibilities clear.

NOTE: Set COCALC_ACP_MAX_SESSIONS to a number to cause codex-acp to
limit the number of sessions in memory at once, to avoid using too
much RAM.
*/

import { randomUUID } from "node:crypto";
import path from "node:path";
import { type Client } from "@agentclientprotocol/sdk";
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  KillTerminalCommandRequest,
  KillTerminalResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
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
import { computeLineDiff } from "@cocalc/util/line-diff";
import type {
  AcpStreamUsage,
  AcpStreamEvent,
  AcpStreamHandler,
  CommandOutput,
  CustomCommandHandler,
  ApprovalDecision,
} from "./types";
import type {
  AcpApprovalOptionKind,
  AcpApprovalStatus,
} from "@cocalc/conat/ai/acp/types";
import type {
  FileAdapter,
  TerminalAdapter,
  TerminalHandle,
  TerminalStartOptions,
  PathResolver,
  PathResolution,
} from "./adapters";

const log = getLogger("ai:acp:codex-handler");
const MAX_TERMINAL_STREAM_CHARS = 4000;
const APPROVAL_TIMEOUT_MS = 1000 * 60 * 60 * 8; // 8 hours

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
  handle?: TerminalHandle;
  stop?: () => void;
  output: string;
  truncated: boolean;
  exitStatus?: TerminalExitStatus;
  waiters: Array<(status: TerminalExitStatus) => void>;
  limit?: number;
  sessionId?: string;
  waitPromise?: Promise<TerminalExitStatus | undefined>;
};

type CodexClientHandlerOptions = {
  commandHandlers?: Map<string, CustomCommandHandler>;
  captureToolCalls?: boolean;
  workspaceRoot?: string;
  fileAdapter: FileAdapter;
  terminalAdapter: TerminalAdapter;
  pathResolver?: PathResolver;
};

type AcpApprovalEvent = Extract<AcpStreamEvent, { type: "approval" }>;
type AcpTerminalEvent = Extract<AcpStreamEvent, { type: "terminal" }>;
type AcpFileEvent = Extract<AcpStreamEvent, { type: "file" }>;

type PendingApproval = {
  approvalId: string;
  event: AcpApprovalEvent;
  resolve: (response: RequestPermissionResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

export class CodexClientHandler implements TerminalClient {
  private stream?: AcpStreamHandler;
  private lastResponse = "";
  private latestUsage?: AcpStreamUsage;
  private fileSnapshots = new Map<string, string>();
  private terminals = new Map<string, TerminalState>();
  private readonly commandHandlers?: Map<string, CustomCommandHandler>;
  private pendingApprovals = new Map<string, PendingApproval>();
  private callToTerminal = new Map<string, string>();
  private terminalBuffers = new Map<string, string>();
  private readonly captureToolCalls: boolean;
  private workspaceRoot: string;
  private readonly fileAdapter: FileAdapter;
  private readonly terminalAdapter: TerminalAdapter;
  private readonly pathResolver?: PathResolver;

  constructor(options: CodexClientHandlerOptions) {
    this.commandHandlers = options.commandHandlers;
    this.captureToolCalls = options.captureToolCalls ?? false;
    this.workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
    this.fileAdapter = options.fileAdapter;
    this.terminalAdapter = options.terminalAdapter;
    this.pathResolver = options.pathResolver;
  }

  setStream(stream?: AcpStreamHandler) {
    this.stream = stream;
    this.lastResponse = "";
    // Snapshots are turn-local: clear any stale file baselines when a new stream
    // begins so diffs cannot leak across turns.
    this.fileSnapshots.clear();
  }

  clearStream() {
    this.stream = undefined;
  }

  setWorkspaceRoot(root?: string): void {
    if (!root) return;
    this.workspaceRoot = path.resolve(root);
  }

  getFinalResponse(): string {
    return this.lastResponse.trim() || "(no response)";
  }

  async requestPermission(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    const option = params.options[0];
    if (!option) {
      return {
        outcome: {
          outcome: "cancelled",
        },
      };
    }
    if (!this.stream) {
      log.warn("requestPermission without active stream, auto-cancelling", {
        toolCallId: params.toolCall.toolCallId,
      });
      return {
        outcome: {
          outcome: "cancelled",
        },
      };
    }
    const approvalId = `${params.toolCall.toolCallId}-${randomUUID()}`;
    const event = this.buildApprovalEvent(approvalId, params);
    try {
      await this.emitApprovalEvent(event);
    } catch (err) {
      log.warn("failed to emit approval request, auto-cancelling", err);
      return {
        outcome: {
          outcome: "cancelled",
        },
      };
    }
    return await new Promise<RequestPermissionResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(approvalId);
        const timeoutEvent: AcpApprovalEvent = {
          ...event,
          status: "timeout",
          decidedAt: new Date().toISOString(),
          decidedBy: "system",
          note: "Timed out waiting for approval",
        };
        void this.emitApprovalEvent(timeoutEvent);
        resolve({
          outcome: {
            outcome: "cancelled",
          },
        });
      }, APPROVAL_TIMEOUT_MS);

      this.pendingApprovals.set(approvalId, {
        approvalId,
        event,
        timer,
        resolve: (response) => {
          clearTimeout(timer);
          this.pendingApprovals.delete(approvalId);
          resolve(response);
        },
        reject: (err) => {
          clearTimeout(timer);
          this.pendingApprovals.delete(approvalId);
          reject(err);
        },
      });
    });
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    //     log.debug("acp.sessionUpdate", {
    //       sessionId: params.sessionId,
    //       update: params.update.sessionUpdate,
    //     });
    if (!this.stream) return;
    const usageMeta =
      (params.update as any)?.meta?.token_usage ??
      (params.update as any)?._meta?.token_usage;
    if (usageMeta != null) {
      const usage = mapTokenUsage(usageMeta);
      if (usage) {
        this.latestUsage = usage;
        // Stream live usage so the UI can update context meters mid-turn.
        await this.stream({
          type: "usage",
          usage,
        });
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
      case "tool_call":
        if (this.captureToolCalls) {
          await this.handleToolCall(update);
        }
        break;
      case "tool_call_update":
        if (this.captureToolCalls) {
          await this.handleToolCallUpdate(update);
        }
        break;
      default:
        break;
    }
  }

  private async handleToolCall(update: any): Promise<void> {
    log.debug("acp.tool_call", {
      meta: getMeta(update),
      rawInput: update.rawInput,
    });
    const meta = getMeta(update);
    const info = meta?.terminal_info ?? meta?.terminalInfo;
    const callId =
      update.toolCallId ??
      update.tool_call_id ??
      update.rawInput?.call_id ??
      update.rawInput?.callId;
    const terminalId =
      info?.terminal_id ??
      info?.terminalId ??
      this.extractTerminalId(update) ??
      callId;
    if (!terminalId) return;
    if (callId) {
      this.callToTerminal.set(callId, terminalId);
    }
    const { command, args, cwd } = this.extractCommandInfo(update.rawInput);
    await this.emitTerminalEvent(terminalId, {
      phase: "start",
      command,
      args,
      cwd: cwd ?? info?.cwd,
    });
  }

  private async handleToolCallUpdate(update: any): Promise<void> {
    // Codex’s ACP adapter only sends proper terminal metadata (`meta.terminal_output`,
    // `terminal_exit`) when it runs through the ACP terminal proxy.  In native-shell mode
    // we still get tool_call/tool_call_update notifications, but the terminal details live
    // solely inside `rawInput`/`rawOutput`.  Rather than patch Codex itself again, we
    // synthesize terminal events here by tracking the command/aggregated output and emitting
    // “start / data / exit” updates whenever the ACP metadata is missing.
    log.debug("acp.tool_call_update", {
      meta: getMeta(update),
      rawOutput: update.rawOutput,
    });
    const meta = getMeta(update);
    const terminalId = this.resolveTerminalId(update);
    const output = meta?.terminal_output ?? meta?.terminalOutput;
    if (output) {
      const outputTerminalId =
        output.terminal_id ?? output.terminalId ?? terminalId;
      const chunk = typeof output.data === "string" ? output.data : undefined;
      if (chunk && outputTerminalId) {
        await this.emitTerminalEvent(outputTerminalId, {
          phase: "data",
          chunk,
          truncated: Boolean(output.truncated),
        });
      }
    }
    const exit = meta?.terminal_exit ?? meta?.terminalExit;
    if (exit) {
      const exitTerminalId = exit.terminal_id ?? exit.terminalId ?? terminalId;
      const aggregated =
        typeof update.rawOutput?.aggregated_output === "string"
          ? update.rawOutput.aggregated_output
          : undefined;
      if (exitTerminalId) {
        await this.emitTerminalEvent(exitTerminalId, {
          phase: "exit",
          exitStatus: normalizeTerminalExitStatus({
            exitCode:
              typeof exit.exit_code === "number"
                ? exit.exit_code
                : (exit.exitCode ?? undefined),
            signal: exit.signal ?? undefined,
          }),
          output: aggregated,
          truncated: Boolean(exit.truncated),
        });
        this.flushSyntheticTerminal(exitTerminalId, update);
        return;
      }
    }

    if (!terminalId) {
      return;
    }
    const aggregated = this.extractAggregatedOutput(update.rawOutput);
    if (aggregated != null) {
      const delta = this.computeTerminalDelta(terminalId, aggregated);
      if (delta) {
        await this.emitTerminalEvent(terminalId, {
          phase: "data",
          chunk: delta,
          truncated: false,
        });
      }
    }
    if (this.isTerminalComplete(update)) {
      await this.emitTerminalEvent(terminalId, {
        phase: "exit",
        exitStatus: normalizeTerminalExitStatus({
          exitCode: this.extractExitCode(update.rawOutput),
          signal: update.rawOutput?.signal ?? undefined,
        }),
        output: aggregated ?? update.rawOutput?.formatted_output,
        truncated: false,
      });
      this.flushSyntheticTerminal(terminalId, update);
    }
  }

  private extractTerminalId(update: any): string | undefined {
    const entries: any[] = Array.isArray(update.content) ? update.content : [];
    for (const entry of entries) {
      if (
        entry &&
        typeof entry === "object" &&
        entry.type === "terminal" &&
        typeof entry.terminalId === "string"
      ) {
        return entry.terminalId;
      }
      if (
        entry &&
        typeof entry === "object" &&
        entry.type === "terminal" &&
        typeof entry.terminal_id === "string"
      ) {
        return entry.terminal_id;
      }
    }
    return undefined;
  }

  private extractCommandInfo(rawInput: any): {
    command?: string;
    args?: string[];
    cwd?: string;
  } {
    if (!rawInput || typeof rawInput !== "object") {
      return {};
    }
    const commandList: string[] | undefined = Array.isArray(rawInput.command)
      ? rawInput.command
      : undefined;
    let command: string | undefined;
    let args: string[] | undefined;
    if (commandList?.length) {
      [command, ...args] = commandList;
    }
    return {
      command,
      args,
      cwd:
        typeof rawInput.cwd === "string"
          ? rawInput.cwd
          : rawInput.cwd?.toString(),
    };
  }

  private resolveTerminalId(update: any): string | undefined {
    const meta = getMeta(update);
    const terminalMeta =
      meta?.terminal_output ??
      meta?.terminalOutput ??
      meta?.terminal_exit ??
      meta?.terminalExit ??
      meta?.terminal_info ??
      meta?.terminalInfo;
    if (terminalMeta?.terminal_id ?? terminalMeta?.terminalId) {
      return terminalMeta.terminal_id ?? terminalMeta.terminalId;
    }
    const callId =
      update.toolCallId ??
      update.tool_call_id ??
      update.rawOutput?.call_id ??
      update.rawOutput?.callId;
    if (!callId) return undefined;
    const mapped = this.callToTerminal.get(callId);
    if (mapped) return mapped;
    this.callToTerminal.set(callId, callId);
    return callId;
  }

  private extractAggregatedOutput(rawOutput: any): string | undefined {
    if (!rawOutput || typeof rawOutput !== "object") return undefined;
    if (typeof rawOutput.aggregated_output === "string") {
      return rawOutput.aggregated_output;
    }
    if (typeof rawOutput.stdout === "string" && rawOutput.stdout.length) {
      return rawOutput.stdout;
    }
    return undefined;
  }

  private computeTerminalDelta(id: string, latest: string): string | undefined {
    const previous = this.terminalBuffers.get(id) ?? "";
    this.terminalBuffers.set(id, latest);
    if (!latest) return undefined;
    if (latest.startsWith(previous)) {
      return latest.slice(previous.length);
    }
    return latest;
  }

  private extractExitCode(rawOutput: any): number | undefined {
    if (!rawOutput || typeof rawOutput !== "object") return undefined;
    const value =
      rawOutput.exit_code ??
      rawOutput.exitCode ??
      rawOutput.status_code ??
      rawOutput.statusCode;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  }

  private isTerminalComplete(update: any): boolean {
    if (
      update.status &&
      update.status !== "in_progress" &&
      update.status !== "pending"
    ) {
      return true;
    }
    const rawOutput = update.rawOutput;
    if (!rawOutput || typeof rawOutput !== "object") return false;
    const code = this.extractExitCode(rawOutput);
    if (code != null) return true;
    if (typeof rawOutput.stderr === "string" && rawOutput.stderr.length) {
      return true;
    }
    if (typeof rawOutput.formatted_output === "string") {
      return true;
    }
    return false;
  }

  private flushSyntheticTerminal(id: string, update?: any): void {
    this.terminalBuffers.delete(id);
    const callId =
      update?.toolCallId ??
      update?.tool_call_id ??
      update?.rawOutput?.call_id ??
      update?.rawOutput?.callId;
    if (callId) {
      this.callToTerminal.delete(callId);
    }
  }

  private resolvePath(filePath: string): PathResolution {
    if (this.pathResolver) {
      return this.pathResolver.resolve(filePath);
    }
    const base = this.workspaceRoot ?? process.cwd();
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(base, filePath);
    return {
      absolute,
      relative: this.toRelativePath(absolute),
      workspaceRoot: this.workspaceRoot,
    };
  }

  private formatWorkspacePath(targetPath?: string): string | undefined {
    if (!targetPath) return targetPath;
    const { absolute, relative } = this.resolvePath(targetPath);
    if (relative && !relative.startsWith("..")) {
      return `./${relative}`;
    }
    return toPosix(absolute);
  }

  private toRelativePath(absolute: string): string | undefined {
    try {
      const relative = path.relative(this.workspaceRoot, absolute);
      const normalized = toPosix(relative);
      if (normalized && !normalized.startsWith("..")) {
        return normalized || ".";
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  async readTextFile({
    path: targetPath,
    limit,
    line,
  }: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    const { absolute } = this.resolvePath(targetPath);
    log.debug("acp.read_text_file", {
      path: absolute,
      line,
      limit,
    });
    const data = await this.fileAdapter.readTextFile(absolute);
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
    const { absolute } = this.resolvePath(targetPath);
    const previous = this.fileSnapshots.get(absolute);
    log.debug("acp.write_text_file", {
      path: absolute,
      bytes: content.length,
    });
    await this.fileAdapter.writeTextFile(absolute, content);
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

  resolveApprovalDecision(decision: ApprovalDecision): boolean {
    const pending = this.pendingApprovals.get(decision.approvalId);
    if (!pending) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pendingApprovals.delete(decision.approvalId);
    const decidedAt = new Date().toISOString();
    const status: AcpApprovalStatus =
      decision.status ?? (decision.optionId ? "selected" : "cancelled");
    const updated: AcpApprovalEvent = {
      ...pending.event,
      status,
      decidedAt,
      decidedBy: decision.decidedBy,
      note: decision.note,
      selectedOptionId: decision.optionId,
    };
    void this.emitApprovalEvent(updated);
    if (decision.optionId) {
      pending.resolve({
        outcome: {
          outcome: "selected",
          optionId: decision.optionId,
        },
      });
    } else {
      pending.resolve({
        outcome: {
          outcome: "cancelled",
        },
      });
    }
    return true;
  }

  private async emitApprovalEvent(event: AcpApprovalEvent): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "event",
      event,
    });
  }

  private buildApprovalEvent(
    approvalId: string,
    params: RequestPermissionRequest,
    overrides?: Partial<AcpApprovalEvent>,
  ): AcpApprovalEvent {
    const timeoutAt =
      overrides?.timeoutAt ??
      new Date(Date.now() + APPROVAL_TIMEOUT_MS).toISOString();
    const requestedAt = overrides?.requestedAt ?? new Date().toISOString();
    const options = params.options.map((opt) => ({
      optionId: opt.optionId,
      name: opt.name,
      kind: opt.kind as AcpApprovalOptionKind,
    }));
    return {
      type: "approval",
      approvalId,
      status: overrides?.status ?? "pending",
      requestedAt,
      timeoutAt,
      title: overrides?.title ?? params.toolCall.title ?? "Permission required",
      description:
        overrides?.description ?? this.describeToolCall(params.toolCall),
      toolCallId: params.toolCall.toolCallId,
      toolKind: (params.toolCall as any)?.kind ?? undefined,
      options,
      selectedOptionId: overrides?.selectedOptionId,
      decidedAt: overrides?.decidedAt,
      decidedBy: overrides?.decidedBy,
      note: overrides?.note,
    };
  }

  private describeToolCall(
    toolCall: RequestPermissionRequest["toolCall"],
  ): string | undefined {
    const content = (toolCall as any)?.content;
    if (Array.isArray(content)) {
      const texts: string[] = [];
      for (const entry of content) {
        if (entry && typeof entry === "object") {
          if (typeof (entry as any).text === "string") {
            texts.push((entry as any).text);
          } else if (typeof (entry as any).title === "string") {
            texts.push((entry as any).title);
          }
        }
      }
      if (texts.length) {
        return texts.join("\n");
      }
    }
    const rawInput = (toolCall as any)?.rawInput;
    if (typeof rawInput === "string" && rawInput.trim()) {
      return rawInput;
    }
    return undefined;
  }

  async createTerminal({
    sessionId,
    command,
    args,
    env,
    cwd,
    outputByteLimit,
  }: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    const terminalId = randomUUID();
    const proxied = this.commandHandlers?.size && !this.captureToolCalls;
    log.debug("acp.create_terminal", {
      command,
      args,
      cwd,
      terminalId,
      proxied,
      workspaceRoot: this.workspaceRoot,
    });
    const envVars = this.buildEnv(env);
    const limit =
      outputByteLimit != null
        ? Number(outputByteLimit)
        : MAX_TERMINAL_STREAM_CHARS;
    const customInvocation = this.resolveCustomCommand(command, args ?? []);
    if (customInvocation) {
      const cwdResolved = cwd ?? this.workspaceRoot ?? process.cwd();
      await this.startCustomCommand({
        sessionId,
        terminalId,
        command: customInvocation.command,
        args: customInvocation.args,
        cwd: cwdResolved,
        env: envVars,
        limit,
        handler: customInvocation.handler,
      });
      return { terminalId };
    }

    const state: TerminalState = {
      output: "",
      truncated: false,
      exitStatus: undefined,
      waiters: [],
      limit,
      sessionId,
    };
    this.terminals.set(terminalId, state);
    const startOptions: TerminalStartOptions = {
      terminalId,
      command,
      args: args ?? [],
      cwd: cwd ?? this.workspaceRoot ?? process.cwd(),
      env: envVars,
      sessionId,
      limit,
    };

    const handleChunk = (chunk: string) => {
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

    const waitForExit = async (): Promise<TerminalExitStatus | undefined> => {
      try {
        const result = await state.handle?.waitForExit();
        if (result) {
          state.exitStatus = result.exitStatus;
          if (typeof result.output === "string" && result.output.length) {
            state.output = result.output;
          }
          if (result.truncated) {
            state.truncated = true;
          }
        }
      } catch (err: any) {
        state.exitStatus = { exitCode: undefined, signal: err?.message };
      }
      if (state.exitStatus == null) {
        state.exitStatus = { exitCode: undefined };
      }
      for (const waiter of state.waiters) {
        waiter(state.exitStatus);
      }
      state.waiters.length = 0;
      await this.emitTerminalEvent(terminalId, {
        phase: "exit",
        exitStatus: normalizeTerminalExitStatus(state.exitStatus),
        output: state.output,
        truncated: state.truncated,
      });
      return state.exitStatus;
    };

    try {
      state.handle = await this.terminalAdapter.start(startOptions, (chunk) =>
        handleChunk(chunk),
      );
      state.waitPromise = waitForExit();
      state.stop = async () => {
        await state.handle?.kill();
      };
    } catch (err: any) {
      state.exitStatus = { exitCode: undefined, signal: err?.message };
      await this.emitTerminalEvent(terminalId, {
        phase: "exit",
        exitStatus: normalizeTerminalExitStatus(state.exitStatus),
        output: state.output,
        truncated: state.truncated,
      });
      throw err;
    }

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
  ): Record<string, string> {
    const envVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value != null) {
        envVars[key] = String(value);
      }
    }
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
      while (
        envArgs.length &&
        envArgs[0].includes("=") &&
        !envArgs[0].startsWith("-")
      ) {
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
    sessionId,
    terminalId,
    command,
    args,
    cwd,
    env,
    limit,
    handler,
  }: {
    sessionId?: string;
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
      limit: limit ?? MAX_TERMINAL_STREAM_CHARS,
      sessionId,
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
        exitStatus: normalizeTerminalExitStatus(status),
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
    if (!state.waitPromise) {
      state.waitPromise = (async () => {
        const result = await state.handle?.waitForExit();
        if (result) {
          state.exitStatus = result.exitStatus;
          if (typeof result.output === "string" && result.output.length) {
            state.output = result.output;
          }
          if (result.truncated) {
            state.truncated = true;
          }
        }
        return state.exitStatus;
      })();
    }
    const status = await state.waitPromise;
    if (status) {
      return toWaitResponse(status);
    }
    return toWaitResponse({ exitCode: undefined });
  }

  async killTerminal({
    terminalId,
  }: KillTerminalCommandRequest): Promise<KillTerminalResponse> {
    log.debug("acp.kill_terminal", { terminalId });
    const state = this.terminals.get(terminalId);
    if (state == null) {
      throw new Error(`Unknown terminal ${terminalId}`);
    }
    if (state.handle) {
      await state.handle.kill();
    } else {
      await state.stop?.();
    }
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
    if (state.handle) {
      await state.handle.kill();
    } else {
      await state.stop?.();
    }
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

  interruptSession(sessionId: string): void {
    for (const [terminalId, state] of this.terminals.entries()) {
      if (state.sessionId === sessionId) {
        try {
          state.stop?.();
        } catch (err) {
          log.warn("failed to stop terminal during interrupt", {
            terminalId,
            err,
          });
        }
      }
    }
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
    if (eventPayload.cwd) {
      eventPayload.cwd = this.formatWorkspacePath(eventPayload.cwd);
    }
    await this.stream({
      type: "event",
      event: {
        type: "terminal",
        terminalId,
        ...eventPayload,
      },
    });
    // NOTE: we intentionally skip emitSnapshotDiffs() here. Diffing across
    // terminal exits caused stale turn-to-turn diffs because snapshots can be
    // from an older turn. Diffs are now only emitted from explicit write/read
    // paths within the current turn.
  }

  private async emitDiffEvent(
    filePath: string,
    previous?: string,
    next?: string,
  ): Promise<boolean> {
    if (!this.stream || previous == null || next == null) {
      return false;
    }
    if (previous === next) return false;
    const diff = computeLineDiff(previous, next);
    if (!diff.lines.length) return false;
    await this.stream({
      type: "event",
      event: {
        type: "diff",
        path: this.formatWorkspacePath(filePath) ?? filePath,
        diff,
      },
    });
    return true;
  }

  private async emitFileEvent(
    path: string,
    payload: Omit<AcpFileEvent, "type" | "path">,
  ): Promise<void> {
    if (!this.stream) return;
    const displayPath = this.formatWorkspacePath(path) ?? path;
    await this.stream({
      type: "event",
      event: {
        type: "file",
        path: displayPath,
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

async function* toAsyncIterable(output: CommandOutput): AsyncIterable<string> {
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

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
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
  // If the reported context window is smaller than the total tokens, the value
  // is likely incorrect (observed with Codex returning used tokens instead of
  // capacity). In that case, drop it so the frontend can fall back to a known
  // model default.
  if (
    contextWindow != null &&
    (totalTokens == null || contextWindow >= totalTokens)
  ) {
    usage.model_context_window = contextWindow;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function getMeta(update: any): any | undefined {
  if (!update || typeof update !== "object") return undefined;
  return update._meta ?? update.meta;
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

function normalizeTerminalExitStatus(
  status?: TerminalExitStatus | null,
): { exitCode?: number; signal?: string } | undefined {
  if (status == null) {
    return undefined;
  }
  const exitCode =
    status.exitCode == null ? undefined : Number(status.exitCode);
  const signal =
    status.signal == null || status.signal === "" ? undefined : status.signal;
  if (exitCode == null && signal == null) {
    return undefined;
  }
  return { exitCode, signal };
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

export type { CodexClientHandlerOptions };
export {
  MAX_TERMINAL_STREAM_CHARS,
  mapTokenUsage,
  normalizeTerminalExitStatus,
};
