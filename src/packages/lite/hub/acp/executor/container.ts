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
import type { Client } from "@cocalc/conat/core/client";
import { projectApiClient, type ProjectApi } from "@cocalc/conat/project/api";
import getLogger from "@cocalc/backend/logger";

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
type ContainerExec = (opts: {
  projectId: string;
  script: string;
  cwd?: string;
  timeoutMs?: number;
}) => Promise<{
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: string;
}>;
let containerExec: ContainerExec | null = null;
const logger = getLogger("lite:hub:acp:container-exec");

export function setContainerFileIO(io: ContainerFileIO | null): void {
  containerFileIO = io;
}

export function setContainerExec(fn: ContainerExec | null): void {
  containerExec = fn;
}

// function escapeRegExp(str: string): string {
//   return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// }

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
    if (!containerExec) {
      throw Error(
        "setContainerExec must be called to initialize container execution",
      );
    }
    const cwd = opts?.cwd;
    logger.debug("container executor exec", { cmd, cwd });

    // If the incoming command already looks like a shell invocation
    // (`/bin/bash -lc ...`), unwrap it so we only spawn a single shell.
    const shellMatch = cmd.match(
      /^\s*(?:\/(?:usr\/)?bin\/)?(?:ba?sh|sh)\s+-l?c\s+([\s\S]+)/,
    );
    //const script = this.rewriteHostPaths(shellMatch ? shellMatch[1] : cmd);
    const script = shellMatch ? shellMatch[1] : cmd;

    // The host environment is not meaningful inside the container; skip passing
    // through env vars to avoid leaking/overwriting the project's container env.
    const { stdout, stderr, code, signal } = await containerExec({
      projectId: this.options.projectId,
      script,
      cwd,
      timeoutMs: opts?.timeoutMs,
    });
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
}
