import { execFile } from "node:child_process";
import getLogger from "@cocalc/backend/logger";
import { argsJoin } from "@cocalc/util/args";

export interface SandboxExecOptions {
  projectId: string;
  script: string;
  cwd: string;
  timeoutMs?: number;
}

export interface SandboxExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: string;
}

const logger = getLogger("project-runner:sandbox-exec");

/**
 * Run a shell script inside an existing project container.
 *
 * This mirrors the behavior of the container executor used by ACP:
 * - Executes inside `project-${projectId}`
 * - Uses /bin/bash -lc to run the provided script
 * - Allows a custom cwd inside the container
 * - Captures stdout/stderr/exit code
 *
 * Note: Environment is not propagated from the host; callers should expand any
 * needed env directly into the script if required.
 */
export async function sandboxExec({
  projectId,
  script,
  cwd,
  timeoutMs,
}: SandboxExecOptions): Promise<SandboxExecResult> {
  const args = [
    "exec",
    "-i",
    "--workdir",
    cwd,
    `project-${projectId}`,
    "/bin/bash",
    "-lc",
    script,
  ];

  logger.debug("podman ", argsJoin(args));

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
