import { exec as cpExec, execFile as cpExecFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";

import getLogger from "@cocalc/backend/logger";

import type { AcpExecutor } from "./index";

const exec = promisify(cpExec);
const execFile = promisify(cpExecFile);
const DEFAULT_TERMINAL_TIMEOUT_MS = Number.isFinite(
  Number.parseInt(process.env.COCALC_CODEX_TERMINAL_TIMEOUT_MS ?? "", 10),
)
  ? Number.parseInt(process.env.COCALC_CODEX_TERMINAL_TIMEOUT_MS!, 10)
  : 30_000;

/**
 * Local executor used in lite/single-process mode.
 * Paths are resolved relative to the provided workspaceRoot and prevented
 * from escaping that root.
 */
export class LocalExecutor implements AcpExecutor {
  private readonly logger = getLogger("lite:hub:acp:local-exec");

  constructor(private readonly workspaceRoot: string) {}

  toString = () => `LocalExecutor(workspaceRoot=${this.workspaceRoot})`;

  private resolvePath(relativePath: string): string {
    const base = path.resolve(this.workspaceRoot || process.cwd());
    const target = path.resolve(base, relativePath);
    if (!target.startsWith(base)) {
      throw new Error(`Path escapes workspace: ${relativePath}`);
    }
    return target;
  }

  async readTextFile(relativePath: string): Promise<string> {
    const target = this.resolvePath(relativePath);
    return await fs.readFile(target, "utf8");
  }

  async writeTextFile(relativePath: string, content: string): Promise<void> {
    const target = this.resolvePath(relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }

  async exec(
    cmd: string,
    opts?: { cwd?: string; timeoutMs?: number; env?: Record<string, string> },
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string;
  }> {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TERMINAL_TIMEOUT_MS;
    const cwd = opts?.cwd
      ? this.resolvePath(opts.cwd)
      : path.resolve(this.workspaceRoot || process.cwd());
    const shellMatch = cmd.match(
      /^\s*(?:\/(?:usr\/)?bin\/)?(?:ba?sh|sh)\s+-l?c\s+([\s\S]+)/,
    );
    this.logger.debug("local exec", { cmd, cwd, timeoutMs });
    if (shellMatch) {
      const script = shellMatch[1];
      return await this.run("/bin/bash", ["-lc", script], cwd, {
        ...opts,
        timeoutMs,
      });
    }
    return await this.run(cmd, undefined, cwd, { ...opts, timeoutMs });
  }

  private async run(
    command: string,
    args: string[] | undefined,
    cwd: string,
    opts?: { timeoutMs?: number; env?: Record<string, string> },
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string;
  }> {
    try {
      if (args) {
        const { stdout, stderr } = await execFile(command, args, {
          cwd,
          env: { ...process.env, ...(opts?.env ?? {}) },
          timeout: opts?.timeoutMs ?? DEFAULT_TERMINAL_TIMEOUT_MS,
          killSignal: "SIGKILL",
          maxBuffer: 10 * 1024 * 1024,
        });
        return {
          stdout: stdout?.toString?.() ?? stdout ?? "",
          stderr: stderr?.toString?.() ?? stderr ?? "",
          exitCode: 0,
        };
      }
      const { stdout, stderr } = await exec(command, {
        cwd,
        env: { ...process.env, ...(opts?.env ?? {}) },
        timeout: opts?.timeoutMs ?? DEFAULT_TERMINAL_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        stdout: stdout?.toString?.() ?? stdout ?? "",
        stderr: stderr?.toString?.() ?? stderr ?? "",
        exitCode: 0,
      };
    } catch (err: any) {
      // Propagate failures for callers that expect rejection on nonzero exit.
      if (typeof err?.code === "number") {
        throw new Error(
          err?.stderr?.toString?.() ?? err?.message ?? "exec failed",
        );
      }
      return {
        stdout: err?.stdout ?? "",
        stderr: err?.stderr ?? err?.message ?? "",
        exitCode: typeof err?.code === "number" ? err.code : null,
        signal: err?.signal,
      };
    }
  }
}
