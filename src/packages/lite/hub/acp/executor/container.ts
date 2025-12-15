import path from "node:path";
import type { Client } from "@cocalc/conat/core/client";
import { projectApiClient, type ProjectApi } from "@cocalc/conat/project/api";
import type { ExecuteCodeOutput } from "@cocalc/util/types/execute-code";

// Container executor for multiuser (podman) mode.
// Wraps project-scoped conat APIs to run commands and read/write files
// inside a project container.
export interface ContainerExecutorOptions {
  projectId: string;
  workspaceRoot: string; // absolute path inside the project container
  conatClient?: Client;
  computeServerId?: number;
  env?: Record<string, string>;
}

export class ContainerExecutor {
  private readonly api: ProjectApi;
  private readonly base: string;

  constructor(private readonly options: ContainerExecutorOptions) {
    this.api = projectApiClient({
      project_id: options.projectId,
      client: options.conatClient,
      compute_server_id: options.computeServerId,
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
    const timeoutSeconds =
      opts?.timeoutMs != null ? Math.ceil(opts.timeoutMs / 1000) : undefined;
    const env = { ...(this.options.env ?? {}), ...(opts?.env ?? {}) };
    const output = (await this.api.system.exec({
      command: cmd,
      bash: true,
      cwd,
      timeout: timeoutSeconds,
      env,
      err_on_exit: false,
    })) as ExecuteCodeOutput;

    const exitCode = (output as any)?.exit_code ?? null;
    return {
      stdout: (output as any)?.stdout ?? "",
      stderr: (output as any)?.stderr ?? "",
      exitCode,
      signal: (output as any)?.signal ?? undefined,
    };
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
}
