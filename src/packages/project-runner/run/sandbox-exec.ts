import { execFile } from "node:child_process";
import getLogger from "@cocalc/backend/logger";
import { argsJoin } from "@cocalc/util/args";
import { localPath } from "./filesystem";
import { getImageNamePath, mount as mountRootFs } from "./rootfs";
import { readFile } from "fs/promises";
import { networkArgument } from "./podman";
import { mountArg } from "@cocalc/backend/podman";
import { getEnvironment } from "./env";

export interface SandboxExecOptions {
  project_id: string;
  script: string;
  cwd?: string;
  timeoutMs?: number;
  /**
   * When true, start a fresh one-off container instead of exec'ing into the
   * existing project container. This is useful when the main container is not
   * running or when we want to mount the workspace at a different host path
   * (e.g., to avoid path rewriting).
   * NOTE: the project must have been run at least once on the project host
   * or we don't have sufficient information to run it and there will be an error.
   */
  useEphemeral?: boolean;
  /**
   * When true mount the path to the project's files into the container as is
   * instead of mounting it to /root.   E.g., if files are in /projects/project-{project_id},
   * then in the container we mount /projects/project-{project_id} as /projects/project-{project_id}
   * and set HOME to /projects/project-{project_id}.
   */
  useHostHomeMount?: boolean;

  /** Optionally disable network for ephemeral runs */
  noNetwork?: boolean;
}

export interface SandboxExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: string;
}

const logger = getLogger("project-runner:sandbox-exec");

// this will fail if never run on this project host, as documented above.
async function getContainerImage(home: string): Promise<string> {
  return (await readFile(getImageNamePath(home))).toString().trim();
}

/**
 * Run a shell script inside an existing project container.
 *
 * This mirrors the behavior of the container executor used by ACP:
 * - By default executes inside `project-${project_id}` with podman exec.
 * - When useEphemeral is true, starts a one-off container (podman run --rm)
 *   using the same image as the project container, optionally binding a custom
 *   hostHomeMount at /root.
 * - Uses /bin/bash -lc to run the provided script
 * - Allows a custom cwd inside the container
 * - Captures stdout/stderr/exit code
 *
 * Note: Environment is not propagated from the host; callers should expand any
 * needed env directly into the script if required.
 */
export async function sandboxExec({
  project_id,
  script,
  cwd,
  timeoutMs,
  useEphemeral,
  useHostHomeMount,
  noNetwork,
}: SandboxExecOptions): Promise<SandboxExecResult> {
  const args: string[] = [];
  let HOME;
  if (useEphemeral) {
    const { home, scratch } = await localPath({
      project_id,
    });
    HOME = useHostHomeMount ? home : "/root";
    const image = await getContainerImage(home);
    const env = await getEnvironment({
      project_id,
      HOME,
      image,
    });

    // Build a one-off container run.
    args.push("run", "--rm", "-i");
    // execFile timeout still applies; podman itself doesn't have a timeout flag.
    if (!noNetwork) {
      args.push(networkArgument());
    }
    if (cwd) {
      args.push("--workdir", cwd);
    }

    for (const key in env) {
      args.push("-e", `${key}=${env[key]}`);
    }

    args.push(mountArg({ source: home, target: HOME }));
    if (scratch) {
      args.push(mountArg({ source: scratch, target: "/scratch" }));
    }

    const rootfs = await mountRootFs({ project_id, home, config: { image } });
    args.push("--rootfs", rootfs);

    // Name the container for easier debugging; allow reuse without conflicts.
    args.push("--name", `sandbox-${project_id}-${Date.now()}`);
    args.push("/bin/bash", "-lc", script);
  } else {
    HOME = "/root";
    args.push(
      "exec",
      "-i",
      "--workdir",
      cwd ?? HOME,
      `project-${project_id}`,
      "/bin/bash",
      "-lc",
      script,
    );
  }

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
