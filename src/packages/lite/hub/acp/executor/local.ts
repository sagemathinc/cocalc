import { exec as cpExec } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { AcpExecutor } from "./index";

const exec = promisify(cpExec);

/**
 * Local executor used in lite/single-process mode.
 * Paths are resolved relative to the provided workspaceRoot and prevented
 * from escaping that root.
 */
export class LocalExecutor implements AcpExecutor {
  constructor(private readonly workspaceRoot: string) {}

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
    const cwd = opts?.cwd
      ? this.resolvePath(opts.cwd)
      : path.resolve(this.workspaceRoot || process.cwd());
    const { stdout, stderr } = await exec(cmd, {
      cwd,
      env: { ...process.env, ...(opts?.env ?? {}) },
      timeout: opts?.timeoutMs,
    });
    return {
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      exitCode: 0,
    };
  }
}
