import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { basename, dirname, join, isAbsolute } from "node:path";
import getLogger from "@cocalc/backend/logger";
import { argsJoin } from "@cocalc/util/args";
import { RefcountLeaseManager } from "@cocalc/util/refcount/lease";
import { setCodexProjectSpawner } from "@cocalc/ai/acp";
import { which } from "@cocalc/backend/which";
import { localPath } from "@cocalc/project-runner/run/filesystem";
import { getImageNamePath, mount as mountRootFs, unmount } from "@cocalc/project-runner/run/rootfs";
import { networkArgument } from "@cocalc/project-runner/run/podman";
import { mountArg } from "@cocalc/backend/podman";
import { getEnvironment } from "@cocalc/project-runner/run/env";
import { getCoCalcMounts } from "@cocalc/project-runner/run/mounts";
import { getProject } from "./sqlite/projects";

const logger = getLogger("project-host:codex-project");
const CONTAINER_TTL_MS = Number(
  process.env.COCALC_CODEX_PROJECT_TTL_MS ?? 60_000,
);

type ContainerInfo = {
  name: string;
  rootfs: string;
  codexPath: string;
  home: string;
};

function codexContainerName(projectId: string): string {
  return `codex-${projectId}`;
}

async function podman(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile("podman", args, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function containerExists(name: string): Promise<boolean> {
  try {
    await podman(["container", "exists", name]);
    return true;
  } catch {
    return false;
  }
}

async function resolveCodexBinary(): Promise<{
  hostPath: string;
  containerPath: string;
  mount: string;
}> {
  const requested = process.env.COCALC_CODEX_BIN ?? "codex";
  let hostPath = requested;
  if (!isAbsolute(hostPath)) {
    const resolved = await which(requested);
    if (!resolved) {
      throw new Error(
        `COCALC_CODEX_BIN must be absolute or in PATH (got ${requested})`,
      );
    }
    hostPath = resolved;
  }
  const hostDir = dirname(hostPath);
  const mount = "/opt/codex/bin";
  const containerPath = join(mount, basename(hostPath));
  return { hostPath, containerPath, mount: hostDir };
}

function resolveCodexHome(): string {
  return process.env.COCALC_CODEX_HOME ??
    (process.env.HOME ? join(process.env.HOME, ".codex") : "/root/.codex");
}

const containerLeases = new RefcountLeaseManager<string>({
  delayMs: CONTAINER_TTL_MS,
  disposer: async (projectId: string) => {
    const name = codexContainerName(projectId);
    try {
      await podman(["rm", "-f", "-t", "0", name]);
    } catch (err) {
      logger.debug("codex container rm failed", { projectId, err: `${err}` });
    }
    await unmount(projectId);
  },
});

async function ensureContainer(projectId: string): Promise<ContainerInfo> {
  const { home, scratch } = await localPath({ project_id: projectId });
  const image = (await fs.readFile(getImageNamePath(home), "utf8")).trim();
  const rootfs = await mountRootFs({ project_id: projectId, home, config: { image } });
  const name = codexContainerName(projectId);
  const { containerPath, mount } = await resolveCodexBinary();
  const codexHome = resolveCodexHome();
  const projectRow = getProject(projectId);
  const hasGpu =
    projectRow?.run_quota?.gpu === true ||
    (projectRow?.run_quota?.gpu_count ?? 0) > 0;

  if (await containerExists(name)) {
    return { name, rootfs, codexPath: containerPath, home };
  }

  const args: string[] = [];
  args.push("run", "--detach", "--rm");
  args.push(networkArgument());
  if (hasGpu) {
    args.push("--device", "nvidia.com/gpu=all");
    args.push("--security-opt", "label=disable");
  }
  args.push("--name", name, "--hostname", name);
  args.push("--workdir", "/root");

  const env = await getEnvironment({
    project_id: projectId,
    HOME: "/root",
    image,
  });
  for (const key in env) {
    args.push("-e", `${key}=${env[key]}`);
  }

  args.push(mountArg({ source: home, target: "/root" }));
  if (scratch) {
    args.push(mountArg({ source: scratch, target: "/scratch" }));
  }
  const mounts = getCoCalcMounts();
  for (const src in mounts) {
    args.push(mountArg({ source: src, target: mounts[src], readOnly: true }));
  }
  args.push(mountArg({ source: mount, target: "/opt/codex/bin", readOnly: true }));
  try {
    const stat = await fs.stat(codexHome);
    if (stat.isDirectory()) {
      args.push(mountArg({ source: codexHome, target: "/root/.codex" }));
    }
  } catch {
    // ignore if codex home missing
  }

  args.push("--rootfs", rootfs);
  args.push("/bin/sh", "-lc", "sleep infinity");

  logger.debug("codex project container: podman", argsJoin(args));
  await podman(args);

  return { name, rootfs, codexPath: containerPath, home };
}

export function initCodexProjectRunner(): void {
  setCodexProjectSpawner({
    async spawnCodexExec({ projectId, args, cwd }) {
      const release = await containerLeases.acquire(projectId);
      let info: ContainerInfo | undefined;
      try {
        info = await ensureContainer(projectId);
      } catch (err) {
        await release();
        throw err;
      }

      const hasSandboxFlag =
        args.includes("--full-auto") ||
        args.includes("--dangerously-bypass-approvals-and-sandbox") ||
        args.includes("--sandbox");
      if (!hasSandboxFlag) {
        logger.warn(
          "codex project: missing sandbox flag; defaulting to --full-auto",
        );
      }
      const execArgs: string[] = [
        "exec",
        "-i",
        "--workdir",
        cwd && cwd.startsWith("/") ? cwd : "/root",
        "-e",
        "HOME=/root",
        info.name,
        info.codexPath,
        ...(hasSandboxFlag ? args : ["--full-auto", ...args]),
      ];
      logger.debug("codex project: podman exec", argsJoin(execArgs));
      const proc = spawn("podman", execArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      proc.on("exit", async () => {
        await release();
      });
      return {
        proc,
        cmd: "podman",
        args: execArgs,
        cwd,
      };
    },
  });
}
