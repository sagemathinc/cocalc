/*
This will implement the following in a project for purposes of ACP:

- read text file
- write text file
- run a bash command

What's implement below probably doesn't work, and is just a first iteration.
We will also likely try multiple versions of this to figure out what is best.
e.g., we could do one that uses the local fs sandbox directly (not the project
podman container), and also creates a container for each terminal execution,
so this can be run without even "starting the project".  So we will see.
*/

import path from "node:path";
import { execFile } from "node:child_process";
import type { Client } from "@cocalc/conat/core/client";
import { projectApiClient, type ProjectApi } from "@cocalc/conat/project/api";

// Container executor for multiuser (podman) mode.
// Wraps project-scoped conat APIs to run commands and read/write files
// inside a project container.
export interface ContainerExecutorOptions {
  projectId: string;
  workspaceRoot: string; // absolute path inside the project container
  conatClient?: Client;
  env?: Record<string, string>;
  projectApi?: ProjectApi; // for testing or prebuilt clients
}

export class ContainerExecutor {
  private readonly api: ProjectApi;
  private readonly base: string;

  constructor(private readonly options: ContainerExecutorOptions) {
    this.api =
      options.projectApi ??
      projectApiClient({
        project_id: options.projectId,
        client: options.conatClient,
      });
    // Normalize workspace root with trailing slash for prefix checks.
    const normalized = path.posix.normalize(options.workspaceRoot || "/");
    this.base = normalized.endsWith("/") ? normalized : `${normalized}/`;
  }

  // Read a project file relative to the project root/workspaceRoot.
  async readTextFile(relativePath: string): Promise<string> {
    const target = this.resolvePath(relativePath);
    return await this.api.system.readTextFileFromProject({ path: target });
  }

  // Write a project file relative to the project root/workspaceRoot.
  async writeTextFile(relativePath: string, content: string): Promise<void> {
    const target = this.resolvePath(relativePath);
    await this.api.system.writeTextFileToProject({ path: target, content });
  }

  // Run a command inside the project container (non-interactive by default).
  async exec(
    cmd: string,
    opts?: { cwd?: string; timeoutMs?: number; env?: Record<string, string> },
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string;
  }> {
    const defaultCwd = this.base === "/" ? "/" : this.base.slice(0, -1);
    const cwd = opts?.cwd ? this.resolvePath(opts.cwd) : defaultCwd;
    const env = { ...(this.options.env ?? {}), ...(opts?.env ?? {}) };
    const args = [
      "exec",
      "-i",
      "--workdir",
      cwd,
      ...Object.entries(env).flatMap(([k, v]) => ["--env", `${k}=${v}`]),
      `project-${this.options.projectId}`,
      "bash",
      "-lc",
      cmd,
    ];

    const { stdout, stderr, code, signal } = await this.podmanExec(
      args,
      opts?.timeoutMs,
    );
    return { stdout, stderr, exitCode: code, signal };
  }

  private resolvePath(relative: string): string {
    const combined = path.posix.normalize(
      path.posix.isAbsolute(relative)
        ? relative
        : path.posix.join(this.base, relative),
    );
    if (!combined.startsWith(this.base)) {
      throw new Error(`Path escapes workspace: ${relative}`);
    }
    return combined;
  }

  private async podmanExec(
    args: string[],
    timeoutMs?: number,
  ): Promise<{ stdout: string; stderr: string; code: number | null; signal?: string }> {
    return await new Promise((resolve) => {
      execFile(
        "podman",
        args,
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error: any, stdout?: string, stderr?: string) => {
          if (error) {
            resolve({
              stdout: stdout ?? "",
              stderr: stderr ?? error?.message ?? "",
              code: typeof error?.code === "number" ? error.code : null,
              signal: error?.signal,
            });
          } else {
            resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code: 0 });
          }
        },
      );
    });
  }
}
