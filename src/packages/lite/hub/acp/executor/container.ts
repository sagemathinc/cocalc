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
import getLogger from "@cocalc/backend/logger";
import { argsJoin } from "@cocalc/util/args";

// Container executor for multiuser (podman) mode.
// Wraps project-scoped conat APIs to run commands and read/write files
// inside a project container. If direct file I/O hooks are registered
// (e.g., by project-host), they are used instead of the network APIs.
export interface ContainerExecutorOptions {
  projectId: string;
  workspaceRoot: string; // absolute path inside the project container
  conatClient?: Client;
  env?: Record<string, string>;
  projectApi?: ProjectApi; // for testing or prebuilt clients
}

type ContainerFileIO = {
  readFile: (projectId: string, path: string) => Promise<string>;
  writeFile: (
    projectId: string,
    path: string,
    content: string,
  ) => Promise<void>;
  mountPoint: (projectId: string) => string;
};

let containerFileIO: ContainerFileIO | null = null;
const logger = getLogger("lite:hub:acp:container-exec");

export function setContainerFileIO(io: ContainerFileIO | null): void {
  containerFileIO = io;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class ContainerExecutor {
  private readonly api: ProjectApi;
  private readonly base: string;

  constructor(private readonly options: ContainerExecutorOptions) {
    if (!options.projectId) {
      // important for security reasons, etc.
      throw Error("projectId must be set for container executor");
    }
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

  toString = () =>
    `ContainerExecutor(base='${this.base}', project='${this.options.projectId}', mount='${this.getMountPoint()}')`;

  // where the project is mounted on the host filesystem
  getMountPoint = (): string => {
    if (!containerFileIO) {
      throw Error("containerFileIO must be defined");
    }
    return containerFileIO.mountPoint(this.options.projectId);
  };

  // Read a project file relative to the project root/workspaceRoot.
  async readTextFile(relativePath: string): Promise<string> {
    const target = this.resolvePath(relativePath);
    if (containerFileIO) {
      return await containerFileIO.readFile(this.options.projectId, target);
    }
    return await this.api.system.readTextFileFromProject({ path: target });
  }

  // Write a project file relative to the project root/workspaceRoot.
  async writeTextFile(relativePath: string, content: string): Promise<void> {
    const target = this.resolvePath(relativePath);
    if (containerFileIO) {
      await containerFileIO.writeFile(this.options.projectId, target, content);
      return;
    }
    await this.api.system.writeTextFileToProject({ path: target, content });
  }

  // Run a command inside the project container using podman.
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
    logger.debug("container executor exec", { cmd, cwd: opts?.cwd });

    // If the incoming command already looks like a shell invocation
    // (`/bin/bash -lc ...`), unwrap it so we only spawn a single shell.
    const shellMatch = cmd.match(
      /^\s*(?:\/(?:usr\/)?bin\/)?(?:ba?sh|sh)\s+-l?c\s+([\s\S]+)/,
    );
    const script = this.rewriteHostPaths(shellMatch ? shellMatch[1] : cmd);

    // The host environment is not meaningful inside the container; skip passing
    // through env vars to avoid leaking/overwriting the project's container env.
    const envArgs: string[] = [];

    const args = [
      "exec",
      "-i",
      "--workdir",
      cwd,
      ...envArgs,
      `project-${this.options.projectId}`,
      "/bin/bash",
      "-lc",
      script,
    ];

    logger.debug("podman ", argsJoin(args));
    const { stdout, stderr, code, signal } = await this.podmanExec(
      args,
      opts?.timeoutMs,
    );
    logger.debug("podman exec result", { code, signal, stdout, stderr });
    return { stdout, stderr, exitCode: code, signal };
  }

  private resolvePath(relative: string): string {
    const combined = path.posix.normalize(
      path.posix.isAbsolute(relative)
        ? relative
        : path.posix.join(this.base, relative),
    );
    // Allow either the trailing-slash form (this.base) or the same path without
    // the trailing slash (e.g., combined === "/root" when base === "/root/").
    const baseNoSlash = this.base.endsWith("/")
      ? this.base.slice(0, -1)
      : this.base;
    const insideBase =
      combined === baseNoSlash ||
      combined === this.base ||
      combined.startsWith(this.base);
    if (!insideBase) {
      throw new Error(
        `Path escapes workspace: ${relative}, combined=${combined}, base=${this.base}`,
      );
    }
    return combined;
  }

  // Rewrite host filesystem paths in shell text to the container view.
  //
  // Why this exists:
  // - Codex/ACP runs in the host and sometimes embeds absolute host paths
  //   (e.g., /home/.../project-<id>/file.txt) inside ad-hoc shell commands that
  //   are later executed inside the project container, where the workspace is
  //   mounted at /root (or similar).
  // - We can’t reliably parse arbitrary shell snippets, but the project mount
  //   prefix is unique, so a straightforward string substitution keeps most
  //   commands working without overhauling Codex/ACP to pass structured paths.
  // - This is a pragmatic hack: if the text contains no host prefix, it’s left
  //   unchanged. For a fully robust solution, Codex/ACP would need to avoid
  //   embedding host paths in free-form shell text.
  private rewriteHostPaths(text: string): string {
    if (!containerFileIO) return text;
    try {
      const host = this.getMountPoint();
      const containerBase = this.base.endsWith("/")
        ? this.base.slice(0, -1)
        : this.base;
      const hostWithSlash = host.endsWith("/") ? host : `${host}/`;
      const reWithSlash = new RegExp(escapeRegExp(hostWithSlash), "g");
      const reNoSlash = new RegExp(
        escapeRegExp(host.endsWith("/") ? host.slice(0, -1) : host),
        "g",
      );
      let out = text.replace(reWithSlash, `${containerBase}/`);
      out = out.replace(reNoSlash, containerBase);
      if (out !== text) {
        logger.debug("rewrite host paths in command", {
          before: text,
          after: out,
        });
      }
      return out;
    } catch (err) {
      logger.debug("rewrite host paths failed; using original command", {
        error: `${err}`,
      });
      return text;
    }
  }

  private async podmanExec(
    args: string[],
    timeoutMs?: number,
  ): Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
    signal?: string;
  }> {
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
