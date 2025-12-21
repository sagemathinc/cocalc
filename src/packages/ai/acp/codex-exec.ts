/*
Codex exec client (per-turn subprocess).

This uses the `codex exec --experimental-json` JSONL stream to drive a single
turn per subprocess. Each evaluate() call spawns a fresh codex process, feeds
the prompt on stdin, parses JSONL events, and emits the same ACP-style stream
payloads our frontend already consumes.

File changes: upstream codex does not include pre-change file contents, so we
maintain a small per-turn cache and heuristics (parse prompt/commands, read
likely files) to reconstruct diffs for the activity log. We previously built a
fork that adds `pre_contents` (see https://github.com/sagemathinc/codex-cocalc),
but chose to avoid forking so deployment and upgrades stay simple: easier
tracking of upstream, easier use in other environments, and no need for users
to trust a custom binary.

Sessions: we treat `thread.started.thread_id` as the session_id. If a session_id
is provided, we pass `codex exec resume <id>`; otherwise the process will emit a
new thread_id. Each turn is a new process; interrupt kills the subprocess.
*/

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import getLogger from "@cocalc/backend/logger";
import { computeLineDiff } from "@cocalc/util/line-diff";
import { argsJoin } from "@cocalc/util/args";
import LRUCache from "lru-cache";
import type { CodexSessionConfig } from "@cocalc/util/ai/codex";
import type { AcpEvaluateRequest, AcpAgent, AcpStreamHandler } from "./types";
import { getCodexProjectSpawner } from "./codex-project";

const logger = getLogger("ai:acp:codex-exec");
const LOG_OUTPUT = Boolean(process.env.COCALC_LOG_CODEX_OUTPUT);
const DEFAULT_PRECONTENT_CACHE_MB = 16;
const DEFAULT_PRECONTENT_MAX_FILE_MB = 2;
const COMPRESS_THRESHOLD_BYTES = 64 * 1024;
const FILE_LINK_GUIDANCE =
  "When referencing workspace files, output markdown links relative to the project root so they stay clickable in CoCalc, e.g., foo.py -> [foo.py](./foo.py) (no backticks around the link). For images use ![](./image.png).";

// JSONL event shapes from codex exec (--experimental-json)
type ThreadEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage: Usage }
  | { type: "turn.failed"; error: ThreadErrorEvent }
  | { type: "item.started"; item: ThreadItem }
  | { type: "item.updated"; item: ThreadItem }
  | { type: "item.completed"; item: ThreadItem }
  | { type: "error"; message: string };

type Usage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};

type ThreadErrorEvent = { message: string };

type ThreadItem = {
  id: string;
  type: string;
  // Flattened details depending on type
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
  changes?: { path: string; kind: string }[];
  pre_contents?: Record<string, string>;
};

type PreContentEntry = {
  data: Buffer | string;
  compressed: boolean;
  bytes: number;
};

type CodexExecOptions = {
  binaryPath?: string; // path to codex binary
  cwd?: string; // workspace root
  env?: NodeJS.ProcessEnv;
  model?: string;
};

type SessionStoreEntry = {
  sessionId: string;
  cwd: string;
};

export class CodexExecAgent implements AcpAgent {
  static async create(opts: CodexExecOptions = {}): Promise<CodexExecAgent> {
    return new CodexExecAgent(opts);
  }

  constructor(private readonly opts: CodexExecOptions = {}) {}

  private sessions = new Map<string, SessionStoreEntry>();
  private running = new Map<
    string,
    { proc: ReturnType<typeof spawn>; stop: () => void }
  >();

  async evaluate(request: AcpEvaluateRequest): Promise<void> {
    const { prompt, stream, session_id, config } = request;
    const session = this.resolveSession(session_id);
    const cwd = this.opts.cwd ?? process.cwd();
    const preContentCache = this.createPreContentCache();
    void this.capturePreContentsFromText(prompt, cwd, preContentCache);
    const args = this.buildArgs(config);
    let cmd = this.opts.binaryPath ?? "codex";
    let proc: ReturnType<typeof spawn>;
    const projectSpawner = getCodexProjectSpawner();
    const projectId = request.chat?.project_id;
    if (projectSpawner && projectId) {
      const spawned = await projectSpawner.spawnCodexExec({
        projectId,
        args,
        cwd,
        env: this.opts.env,
      });
      proc = spawned.proc;
      cmd = spawned.cmd;
      logger.debug("codex-exec: spawning via project container", {
        cmd,
        args: argsJoin(spawned.args),
        cwd: spawned.cwd ?? cwd,
      });
    } else {
      logger.debug("codex-exec: spawning", {
        cmd,
        args: argsJoin(args),
        cwd,
        opts: this.opts,
      });
      const HOME = process.env.COCALC_ORIGINAL_HOME ?? process.env.HOME;
      proc = spawn(cmd, args, {
        cwd,
        env: {
          ...process.env,
          ...this.opts.env,
          ...(HOME ? { HOME } : {}),
        },
      });
    }

    if (LOG_OUTPUT) {
      proc.stdout?.on("data", (chunk) => {
        logger.debug("codex-exec: stdout", chunk.toString());
      });
      proc.stderr?.on("data", (chunk) => {
        logger.debug("codex-exec: stderr", chunk.toString());
      });
    }

    this.running.set(session.sessionId, { proc, stop: () => this.kill(proc) });

    // send prompt
    proc.stdin?.write(this.decoratePrompt(prompt));
    proc.stdin?.end();

    const rl = createInterface({ input: proc.stdout as Readable });
    const errors: string[] = [];
    let finalResponse = "";
    let latestUsage: Usage | undefined;
    let threadId: string | undefined;

    const handleEvent = async (evt: ThreadEvent) => {
      switch (evt.type) {
        case "thread.started": {
          threadId = evt.thread_id;
          this.sessions.set(evt.thread_id, {
            sessionId: evt.thread_id,
            cwd: session.cwd,
          });
          await stream({ type: "status", state: "init" });
          break;
        }
        case "turn.started":
          await stream({ type: "status", state: "running" });
          break;
        case "turn.completed":
          latestUsage = evt.usage;
          break;
        case "turn.failed":
          errors.push(evt.error.message);
          break;
        case "item.completed":
        case "item.started":
        case "item.updated":
          await this.handleItem(
            evt.item,
            stream,
            cwd,
            preContentCache,
            (resp) => {
            finalResponse = resp;
            },
          );
          break;
        case "error":
          errors.push(evt.message);
          break;
        default:
          break;
      }
    };

    const linePromises: Promise<void>[] = [];
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const evt = JSON.parse(line) as ThreadEvent;
        linePromises.push(handleEvent(evt));
      } catch (err) {
        logger.warn("codex-exec: failed to parse JSONL", { line, err });
      }
    });

    const stderrBuf: string[] = [];
    proc.stderr?.on("data", (chunk) => stderrBuf.push(chunk.toString()));

    const exitPromise = new Promise<void>((resolve) => {
      proc.on("exit", (code, signal) => {
        if (code !== 0) {
          const errMsg =
            stderrBuf.join("") ||
            `codex exited with code ${code ?? "?"} signal ${signal ?? "?"}`;
          errors.push(errMsg);
          logger.warn("codex-exec: process exited with code", {
            code,
            signal,
            stderr: stderrBuf.join(""),
          });
        }
        resolve();
      });
      proc.on("error", (err) => {
        errors.push(`spawn error: ${err}`);
        logger.warn("codex-exec: spawn error", err);
      });
    });

    await exitPromise;
    await Promise.all(linePromises);

    const errorText = errors.join("; ");
    if (errorText) {
      await stream({ type: "error", error: errorText });
      if (!finalResponse) {
        finalResponse = errorText;
      } else {
        finalResponse = `${finalResponse}\n\nErrors: ${errorText}`;
      }
    }
    // emit summary even if errors to clear UI state
    await stream({
      type: "summary",
      finalResponse,
      usage: latestUsage ? { ...latestUsage } : undefined,
      threadId,
    });

    this.running.delete(session.sessionId);
  }

  async dispose(): Promise<void> {
    for (const { stop } of this.running.values()) {
      stop();
    }
    this.running.clear();
  }

  async interrupt(threadId: string): Promise<boolean> {
    const running = this.running.get(threadId);
    if (!running) return false;
    running.stop();
    this.running.delete(threadId);
    return true;
  }

  // Helpers
  private resolveSession(sessionId?: string): SessionStoreEntry {
    const key = sessionId?.trim();
    if (key && this.sessions.has(key)) {
      return this.sessions.get(key)!;
    }
    // generate placeholder; thread_id from codex exec will overwrite
    const newId = key ?? randomId();
    return { sessionId: newId, cwd: this.opts.cwd ?? process.cwd() };
  }

  private buildArgs(config?: CodexSessionConfig): string[] {
    const args: string[] = [
      "exec",
      "--experimental-json",
      "--skip-git-repo-check",
    ];
    const model = config?.model ?? this.opts.model;
    if (model) {
      args.push("--model", model);
    }
    if (config?.sessionId) {
      args.push("resume", config.sessionId);
    }
    return args;
  }

  private decoratePrompt(prompt: string): string {
    const isSlashCommand = /^\s*\/\w+/.test(prompt);
    return isSlashCommand ? prompt : `${FILE_LINK_GUIDANCE}\n\n${prompt}`;
  }

  private async handleItem(
    item: ThreadItem,
    stream: AcpStreamHandler,
    cwd: string,
    preContentCache: LRUCache<string, PreContentEntry>,
    onFinalResponse: (text: string) => void,
  ): Promise<void> {
    switch (item.type) {
      case "agent_message":
        if (item.text) {
          onFinalResponse(item.text);
          await stream({
            type: "event",
            event: { type: "message", text: item.text },
          });
        }
        break;
      case "reasoning":
        if (item.text) {
          await stream({
            type: "event",
            event: { type: "thinking", text: item.text },
          });
        }
        break;
      case "command_execution":
        void this.capturePreContentsFromText(item.command, cwd, preContentCache);
        await stream({
          type: "event",
          event: {
            type: "terminal",
            terminalId: item.id,
            phase: "exit",
            command: item.command,
            output: item.aggregated_output ?? "",
            exitStatus: { exitCode: item.exit_code ?? undefined },
          },
        });
        break;
      case "file_change":
        await this.handleFileChange(item, stream, preContentCache);
        break;
      default:
        break;
    }
  }

  private async handleFileChange(
    item: ThreadItem,
    stream: AcpStreamHandler,
    preContentCache: LRUCache<string, PreContentEntry>,
  ) {
    const changes = item.changes ?? [];
    const pre = item.pre_contents ?? {};
    for (const ch of changes) {
      const pathAbs = ch.path;
      const before = pre[pathAbs] ?? this.getCachedContent(pathAbs, preContentCache);
      let after: string | undefined;
      try {
        after = await fs.readFile(pathAbs, "utf8");
      } catch (err) {
        logger.debug("codex-exec: failed to read post content", {
          path: pathAbs,
          err,
        });
      }
      if (before != null && after != null) {
        const diff = computeLineDiff(before, after);
        await stream({
          type: "event",
          event: {
            type: "diff",
            path: pathAbs,
            diff,
          },
        });
      } else {
        await stream({
          type: "event",
          event: {
            type: "file",
            path: pathAbs,
            operation: "write",
            bytes: after != null ? Buffer.byteLength(after) : undefined,
            existed: before != null || ch.kind !== "add",
          },
        });
      }
    }
  }

  private createPreContentCache(): LRUCache<string, PreContentEntry> {
    const maxMb = parseInt(
      process.env.COCALC_CODEX_PRECONTENT_CACHE_MB ?? "",
      10,
    );
    const maxSize =
      (Number.isFinite(maxMb) ? maxMb : DEFAULT_PRECONTENT_CACHE_MB) *
      1024 *
      1024;
    return new LRUCache<string, PreContentEntry>({
      maxSize,
      sizeCalculation: (entry) => entry.bytes,
    });
  }

  private async capturePreContentsFromText(
    text: string | undefined,
    cwd: string,
    cache: LRUCache<string, PreContentEntry>,
  ): Promise<void> {
    if (!text) return;
    const candidates = this.extractPathCandidates(text);
    for (const candidate of candidates) {
      const resolved = path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : path.resolve(cwd, candidate);
      if (!this.isPathUnderRoot(resolved, cwd)) continue;
      await this.maybeCacheFile(resolved, cache);
    }
  }

  private extractPathCandidates(text: string): string[] {
    const candidates = new Set<string>();
    // Capture `-lc '...'` to also scan shell snippets embedded in command strings.
    const inner = text.match(/-lc\s+(['"])([\s\S]*?)\1/);
    const sources = inner ? [text, inner[2]] : [text];
    // Heuristic path detectors:
    // - absolute paths (/...)
    // - relative paths with slashes (foo/bar/baz)
    // - filenames with extensions (foo.txt)
    // We run the broader patterns too, so punctuation or brackets don't block matches.
    const patterns = [
      /\/[A-Za-z0-9._~\-/]+/g,
      /(?:^|\s)([A-Za-z0-9._~\-]+\/[A-Za-z0-9._~\-/]+)/g,
      /([A-Za-z0-9._~\-]+\/[A-Za-z0-9._~\-/]+)/g,
      /(?:^|\s)([A-Za-z0-9._~\-]+\.[A-Za-z0-9._~\-]+)/g,
    ];
    for (const source of sources) {
      for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) != null) {
          const value = match[1] ?? match[0];
          if (!value) continue;
          const cleaned = value
            .replace(/^[\"'`([{]+/, "")
            .replace(/[\"'`);,}\]]+$/, "");
          candidates.add(cleaned);
        }
      }
    }
    return [...candidates];
  }

  private async maybeCacheFile(
    pathAbs: string,
    cache: LRUCache<string, PreContentEntry>,
  ): Promise<void> {
    if (cache.has(pathAbs)) return;
    try {
      const stat = await fs.stat(pathAbs);
      if (!stat.isFile()) return;
      const maxFileMb = parseInt(
        process.env.COCALC_CODEX_PRECONTENT_MAX_FILE_MB ?? "",
        10,
      );
      const maxBytes =
        (Number.isFinite(maxFileMb) ? maxFileMb : DEFAULT_PRECONTENT_MAX_FILE_MB) *
        1024 *
        1024;
      if (stat.size > maxBytes) return;
      const text = await fs.readFile(pathAbs, "utf8");
      const bytes = Buffer.byteLength(text);
      if (bytes > COMPRESS_THRESHOLD_BYTES) {
        const compressed = brotliCompressSync(Buffer.from(text, "utf8"));
        cache.set(pathAbs, {
          data: compressed,
          compressed: true,
          bytes: compressed.length,
        });
      } else {
        cache.set(pathAbs, { data: text, compressed: false, bytes });
      }
    } catch (err) {
      logger.debug("codex-exec: failed to cache pre-content", {
        path: pathAbs,
        err,
      });
    }
  }

  private getCachedContent(
    pathAbs: string,
    cache: LRUCache<string, PreContentEntry>,
  ): string | undefined {
    const entry = cache.get(pathAbs);
    if (!entry) return undefined;
    try {
      if (entry.compressed) {
        return brotliDecompressSync(entry.data as Buffer).toString("utf8");
      }
      return entry.data as string;
    } catch (err) {
      logger.debug("codex-exec: failed to decompress cached content", {
        path: pathAbs,
        err,
      });
      return undefined;
    }
  }

  private isPathUnderRoot(pathAbs: string, root: string): boolean {
    const rel = path.relative(root, pathAbs);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  }

  private kill(proc: ReturnType<typeof spawn>) {
    try {
      proc.kill("SIGKILL");
    } catch (err) {
      logger.warn("codex-exec: failed to kill process", err);
    }
  }
}

function randomId(): string {
  return `codex-${Math.random().toString(36).slice(2)}`;
}
