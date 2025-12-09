import { spawn } from "node:child_process";
import getLogger from "@cocalc/backend/logger";
import { listProjects, upsertProject } from "./sqlite/projects";

const DEFAULT_INTERVAL = 15_000;

const logger = getLogger("project-host:reconcile");

interface ContainerState {
  project_id: string;
  state: "running" | "stopped";
  http_port?: number | null;
  ssh_port?: number | null;
}

function parsePorts(ports?: string): {
  http_port?: number | null;
  ssh_port?: number | null;
} {
  if (!ports) return {};
  let http_port: number | null | undefined;
  let ssh_port: number | null | undefined;
  for (const entry of ports.split(",").map((s) => s.trim())) {
    if (!entry) continue;
    const match = entry.match(/:([0-9]+)->([0-9]+)\/tcp/);
    if (!match) continue;
    const host = Number(match[1]);
    const container = Number(match[2]);
    if (Number.isNaN(host) || Number.isNaN(container)) continue;
    if (container === 80) {
      http_port = host;
    } else if (container === 22) {
      ssh_port = host;
    }
  }
  return { http_port, ssh_port };
}

export async function getContainerStates(): Promise<Map<string, ContainerState>> {
  return await new Promise<Map<string, ContainerState>>((resolve) => {
    const states = new Map<string, ContainerState>();
    const child = spawn("podman", [
      "ps",
      "-a",
      "--format",
      "{{.Names}}|{{.State}}|{{.Ports}}",
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      logger.debug("podman ps failed", { err: `${err}` });
      resolve(states);
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        logger.debug("podman ps exited non-zero", {
          code,
          stderr: stderr.trim(),
        });
        return resolve(states);
      }
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const parts = line.split("|");
        if (parts.length < 2) continue;
        const name = parts[0]?.trim();
        const stateRaw = parts[1]?.trim().toLowerCase();
        const portsRaw = parts[2]?.trim();
        const m = name.match(/^project-([0-9a-fA-F-]{36})$/);
        if (!m) continue;
        const project_id = m[1];
        const state: "running" | "stopped" =
          stateRaw && stateRaw.startsWith("running") ? "running" : "stopped";
        const { http_port, ssh_port } = parsePorts(portsRaw);
        states.set(project_id, { project_id, state, http_port, ssh_port });
      }
      resolve(states);
    });
  });
}

async function reconcileOnce() {
  const now = Date.now();
  const knownProjects = listProjects();
  const knownIds = new Set(knownProjects.map((p) => p.project_id));
  const containers = await getContainerStates();
  // Update rows for containers we see that belong to this host (ignore other hosts on same machine).
  for (const info of containers.values()) {
    if (!knownIds.has(info.project_id)) continue;
    upsertProject({
      project_id: info.project_id,
      state: info.state,
      http_port: info.http_port ?? null,
      ssh_port: info.ssh_port ?? null,
      updated_at: now,
      last_seen: now,
    });
  }

  // Any project we think is running but has no container should be marked stopped.
  for (const row of knownProjects) {
    if (
      !containers.has(row.project_id) &&
      (row.state === "running" || row.state === "starting")
    ) {
      upsertProject({
        project_id: row.project_id,
        state: "stopped",
        http_port: null,
        ssh_port: null,
        updated_at: now,
        last_seen: now,
      });
    }
  }
}

export function startReconciler(intervalMs = DEFAULT_INTERVAL): () => void {
  let timer: NodeJS.Timeout | undefined;
  const tick = async () => {
    try {
      await reconcileOnce();
    } catch (err) {
      logger.debug("reconcileOnce failed", { err: `${err}` });
    }
  };
  timer = setInterval(tick, intervalMs);
  timer.unref();
  tick().catch((err) =>
    logger.debug("initial reconcile failed", { err: `${err}` }),
  );
  return () => timer && clearInterval(timer);
}
