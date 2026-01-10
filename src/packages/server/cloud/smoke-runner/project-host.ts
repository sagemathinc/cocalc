/*
Smoke test for project-host data persistence.

How to run:
- Call runProjectHostPersistenceSmokeTest(...) from a server-side script or
  REPL with a real account_id and host create/update specs. Example:

  const { create } = await buildSmokeCreateSpecFromHost({
    host_id: "<existing-host-id>",
  });
  await runProjectHostPersistenceSmokeTest({
    account_id,
    create,
    update: { machine_type: "<new-type>" },
  });

- Or run against an existing (not-started) host directly:

  await runProjectHostPersistenceSmokeTestForHostId({
    host_id: "<existing-host-id>",
    update: { machine_type: "<new-type>" },
  });

- Or run a preset that creates a new host, exercises it, then cleans up:

  const presets = await listProjectHostSmokePresets({ provider: "gcp" });
  await runProjectHostPersistenceSmokePreset({
    account_id: "<admin-account-id>",
    provider: "gcp",
    preset: presets[0]?.id ?? "gcp-cpu",
  });

What it does:
- Creates a host and waits for it to be running.
- Creates and starts a project on that host.
- Writes a sentinel file via the file-server RPC.
- Stops the host, applies a machine edit, then starts it again.
- Restarts the project and verifies the sentinel file still exists.

Notes:
- This uses real cloud resources and may take several minutes.
- It leaves host/project artifacts on failure for manual inspection.

DEVEL:

export HOST=localhost
export PORT=9001
export MASTER_CONAT_SERVER=https://dev.cocalc.ai
export DEBUG=cocalc:*
export DEBUG_CONSOLE=yes
export account_id='...'

node



a = require('../../dist/cloud/smoke-runner/project-host');  await a.listProjectHostSmokePresets({ provider: "gcp" });


a = require('../../dist/cloud/smoke-runner/project-host');  await a.runProjectHostPersistenceSmokePreset({  account_id: process.env.account_id, provider: "gcp"});




a = require('../../dist/cloud/smoke-runner/project-host'); await a.runProjectHostPersistenceSmokeTestForHostId({host_id:'a8ed241c-1283-4ced-a874-7af630de0897', update:{'machine_type':'n2-standard-4'}})

a = require('../../dist/cloud/smoke-runner/project-host'); await a.runProjectHostPersistenceSmokeTestForHostId({host_id:'f855962b-c50e-4bb4-9da1-84c0dfbd96f4', update:{'machine_type':'8vcpu-32gb'}})

a = require('../../dist/cloud/smoke-runner/project-host'); await a.runProjectHostPersistenceSmokeTestForHostId({host_id:'f855962b-c50e-4bb4-9da1-84c0dfbd96f4', update:{'machine_type':'4vcpu-16gb'}})

a = require('../../dist/cloud/smoke-runner/project-host'); await a.runProjectHostPersistenceSmokeTestForHostId({host_id:'2cb0a79f-387e-4e6b-a0a7-a8b96738538d', update:{'machine_type':'n1-cpu-large'}})

a = require('../../dist/cloud/smoke-runner/project-host'); await a.runProjectHostPersistenceSmokeTestForHostId({host_id:'2cb0a79f-387e-4e6b-a0a7-a8b96738538d', update:{'machine_type':'n1-cpu-medium'}})


*/
import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { createProject } from "@cocalc/server/conat/api/projects";
import { start as startProject } from "@cocalc/server/conat/api/projects";
import { fsClient, fsSubject } from "@cocalc/conat/files/fs";
import {
  createHost,
  deleteHost,
  startHost,
  stopHost,
  updateHostMachine,
} from "@cocalc/server/conat/api/hosts";
import { conatWithProjectRouting } from "@cocalc/server/conat/route-client";
import { materializeProjectHost } from "@cocalc/server/conat/route-project";
import deleteProject from "@cocalc/server/projects/delete";
import { normalizeProviderId, type ProviderId } from "@cocalc/cloud";

const logger = getLogger("server:cloud:smoke-runner:project-host");

type WaitOptions = {
  intervalMs: number;
  attempts: number;
};

type ProjectHostSmokeOptions = {
  account_id: string;
  create: Parameters<typeof createHost>[0];
  update?: Omit<Parameters<typeof updateHostMachine>[0], "id">;
  wait?: Partial<{
    host_running: Partial<WaitOptions>;
    host_stopped: Partial<WaitOptions>;
    project_ready: Partial<WaitOptions>;
  }>;
  cleanup_on_success?: boolean;
  log?: (event: {
    step: string;
    status: "start" | "ok" | "failed";
    message?: string;
  }) => void;
};

type SmokeCreateSpec = Parameters<typeof createHost>[0];

type SmokePreset = {
  id: string;
  label: string;
  provider: ProviderId;
  create: Omit<SmokeCreateSpec, "account_id">;
  update?: Omit<Parameters<typeof updateHostMachine>[0], "id" | "account_id">;
  wait?: ProjectHostSmokeOptions["wait"];
};

export async function buildSmokeCreateSpecFromHost({
  host_id,
  account_id,
  nameSuffix,
}: {
  account_id?: string;
  host_id: string;
  nameSuffix?: string;
}): Promise<{ create: SmokeCreateSpec }> {
  const { rows } = await getPool().query(
    "SELECT name, region, metadata FROM project_hosts WHERE id=$1 AND deleted IS NULL",
    [host_id],
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`host ${host_id} not found`);
  }
  const metadata = row.metadata ?? {};
  const owner = metadata.owner;
  const resolvedAccountId = account_id ?? owner;
  if (!resolvedAccountId) {
    throw new Error("host has no owner; account_id is required");
  }
  if (owner && owner !== resolvedAccountId) {
    throw new Error("host does not belong to account");
  }
  const machine = metadata.machine ?? {};
  const size = metadata.size ?? machine.machine_type ?? "custom";
  const nameBase = row.name || "smoke";
  const suffix = nameSuffix ?? host_id.slice(0, 8);
  return {
    create: {
      account_id: resolvedAccountId,
      name: `${nameBase}-smoke-${suffix}`,
      region: row.region ?? "",
      size,
      gpu: !!metadata.gpu,
      machine,
    },
  };
}

type ProjectHostSmokeResult = {
  ok: boolean;
  host_id?: string;
  project_id?: string;
  steps: Array<{
    name: string;
    status: "ok" | "failed";
    started_at: string;
    finished_at: string;
    error?: string;
  }>;
};

const DEFAULT_HOST_RUNNING: WaitOptions = { intervalMs: 5000, attempts: 180 };
const DEFAULT_HOST_STOPPED: WaitOptions = { intervalMs: 5000, attempts: 120 };
const DEFAULT_PROJECT_READY: WaitOptions = { intervalMs: 3000, attempts: 60 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveWait(
  overrides: Partial<WaitOptions> | undefined,
  fallback: WaitOptions,
): WaitOptions {
  return {
    intervalMs: overrides?.intervalMs ?? fallback.intervalMs,
    attempts: overrides?.attempts ?? fallback.attempts,
  };
}

async function waitForHostStatus(
  host_id: string,
  target: string[],
  opts: WaitOptions,
) {
  for (let attempt = 1; attempt <= opts.attempts; attempt += 1) {
    const { rows } = await getPool().query<{
      status: string | null;
    }>("SELECT status FROM project_hosts WHERE id=$1 AND deleted IS NULL", [
      host_id,
    ]);
    const status = rows[0]?.status ?? "";
    if (target.includes(status)) {
      return status;
    }
    if (status === "error") {
      throw new Error("host status became error");
    }
    await sleep(opts.intervalMs);
  }
  throw new Error(`timeout waiting for host status ${target.join(",")}`);
}

async function waitForHostSeen(
  host_id: string,
  opts: WaitOptions,
  since?: Date,
) {
  for (let attempt = 1; attempt <= opts.attempts; attempt += 1) {
    const { rows } = await getPool().query<{
      last_seen: Date | null;
    }>("SELECT last_seen FROM project_hosts WHERE id=$1 AND deleted IS NULL", [
      host_id,
    ]);
    const lastSeen = rows[0]?.last_seen ?? null;
    if (lastSeen && (!since || lastSeen >= since)) {
      return lastSeen;
    }
    await sleep(opts.intervalMs);
  }
  throw new Error("timeout waiting for host to report last_seen");
}

async function waitForProjectFile(
  clientFactory: () => ReturnType<typeof conatWithProjectRouting>,
  project_id: string,
  path: string,
  expected: string,
  opts: WaitOptions,
) {
  await waitForProjectRouting(project_id, opts);
  const client = fsClient({
    client: clientFactory(),
    subject: fsSubject({ project_id }),
  });
  for (let attempt = 1; attempt <= opts.attempts; attempt += 1) {
    try {
      const contents = await client.readFile(path, "utf8");
      if (contents === expected) {
        return;
      }
    } catch (err) {
      logger.debug("smoke-runner readFile retry", {
        project_id,
        path,
        err: `${err}`,
        attempt,
      });
      if (String(err).includes("no subscribers matching")) {
        await sleep(Math.min(2000, opts.intervalMs));
        continue;
      }
    }
    await sleep(opts.intervalMs);
  }
  throw new Error("timeout waiting for project file");
}

async function waitForProjectRouting(project_id: string, opts: WaitOptions) {
  for (let attempt = 1; attempt <= opts.attempts; attempt += 1) {
    try {
      const address = await materializeProjectHost(project_id);
      if (address) {
        return address;
      }
    } catch (err) {
      logger.debug("smoke-runner routing retry", {
        project_id,
        err: `${err}`,
        attempt,
      });
    }
    await sleep(opts.intervalMs);
  }
  throw new Error("timeout waiting for project routing");
}

async function runSmokeSteps({
  account_id,
  host_id,
  createSpec,
  hostStatus,
  update,
  wait,
  cleanup_on_success,
  cleanup_host,
  log,
}: {
  account_id: string;
  host_id?: string;
  createSpec?: Parameters<typeof createHost>[0];
  hostStatus?: string;
  update?: ProjectHostSmokeOptions["update"];
  wait?: ProjectHostSmokeOptions["wait"];
  cleanup_on_success?: ProjectHostSmokeOptions["cleanup_on_success"];
  cleanup_host?: boolean;
  log?: ProjectHostSmokeOptions["log"];
}): Promise<ProjectHostSmokeResult> {
  const steps: ProjectHostSmokeResult["steps"] = [];
  const waitHostRunning = resolveWait(wait?.host_running, DEFAULT_HOST_RUNNING);
  const waitHostStopped = resolveWait(wait?.host_stopped, DEFAULT_HOST_STOPPED);
  const waitProjectReady = resolveWait(
    wait?.project_ready,
    DEFAULT_PROJECT_READY,
  );
  const emit =
    log ??
    ((event) => {
      logger.info("smoke-runner", event);
    });

  let project_id: string | undefined;
  const routedClient = conatWithProjectRouting();
  const clientFactory = () => routedClient;
  const sentinelPath = ".smoke/persist.txt";
  const sentinelValue = `smoke:${Date.now()}`;
  let hostStartRequestedAt: Date | undefined;
  let createdHost = false;

  const runStep = async (name: string, fn: () => Promise<void>) => {
    const startedAt = new Date();
    emit({ step: name, status: "start" });
    try {
      await fn();
      const finishedAt = new Date();
      steps.push({
        name,
        status: "ok",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
      });
      emit({ step: name, status: "ok" });
    } catch (err) {
      const finishedAt = new Date();
      const message = err instanceof Error ? err.message : String(err);
      steps.push({
        name,
        status: "failed",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        error: message,
      });
      emit({ step: name, status: "failed", message });
      throw err;
    }
  };

  try {
    if (!host_id && createSpec) {
      await runStep("create_host", async () => {
        const host = await createHost({
          ...createSpec,
          account_id,
        });
        host_id = host.id;
        createdHost = true;
      });
    }

    if (host_id && !createSpec && hostStatus !== "running") {
      await runStep("start_existing_host", async () => {
        if (!host_id) throw new Error("missing host_id");
        await startHost({ account_id, id: host_id });
      });
    }

    await runStep("wait_host_running", async () => {
      if (!host_id) throw new Error("missing host_id");
      await waitForHostStatus(host_id, ["running"], waitHostRunning);
    });

    await runStep("create_project", async () => {
      if (!host_id) throw new Error("missing host_id");
      project_id = await createProject({
        account_id,
        title: `Smoke test ${host_id}`,
        host_id,
        start: true,
      });
    });

    await runStep("write_sentinel", async () => {
      if (!project_id) throw new Error("missing project_id");
      await waitForProjectRouting(project_id, waitProjectReady);
      let lastErr: unknown;
      for (
        let attempt = 1;
        attempt <= waitProjectReady.attempts;
        attempt += 1
      ) {
        try {
          const client = fsClient({
            client: clientFactory(),
            subject: fsSubject({ project_id }),
          });
          await client.mkdir(".smoke", { recursive: true });
          await client.writeFile(sentinelPath, sentinelValue);
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          logger.debug("smoke-runner writeFile retry", {
            project_id,
            err: `${err}`,
            attempt,
          });
          if (String(err).includes("no subscribers matching")) {
            await sleep(Math.min(2000, waitProjectReady.intervalMs));
            continue;
          }
          await sleep(waitProjectReady.intervalMs);
        }
      }
      if (lastErr) {
        throw lastErr;
      }
    });

    await runStep("stop_host", async () => {
      if (!host_id) throw new Error("missing host_id");
      await stopHost({ account_id, id: host_id });
      await waitForHostStatus(
        host_id,
        ["off", "deprovisioned"],
        waitHostStopped,
      );
    });

    if (update && Object.keys(update).length > 0) {
      await runStep("update_host", async () => {
        if (!host_id) throw new Error("missing host_id");
        await updateHostMachine({
          ...update,
          account_id,
          id: host_id,
        });
      });
    }

    await runStep("start_host", async () => {
      if (!host_id) throw new Error("missing host_id");
      hostStartRequestedAt = new Date();
      await startHost({ account_id, id: host_id });
      await waitForHostStatus(host_id, ["running"], waitHostRunning);
    });

    await runStep("wait_host_seen", async () => {
      if (!host_id) throw new Error("missing host_id");
      await waitForHostSeen(host_id, waitProjectReady, hostStartRequestedAt);
    });

    await runStep("start_project", async () => {
      if (!project_id) throw new Error("missing project_id");
      let lastErr: unknown;
      for (
        let attempt = 1;
        attempt <= waitProjectReady.attempts;
        attempt += 1
      ) {
        try {
          await startProject({ account_id, project_id });
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          logger.debug("smoke-runner startProject retry", {
            project_id,
            err: `${err}`,
            attempt,
          });
          if (String(err).includes("timeout")) {
            await sleep(waitProjectReady.intervalMs);
            continue;
          }
          await sleep(waitProjectReady.intervalMs);
        }
      }
      if (lastErr) {
        throw lastErr;
      }
    });

    await runStep("verify_sentinel", async () => {
      if (!project_id) throw new Error("missing project_id");
      await waitForProjectFile(
        clientFactory,
        project_id,
        sentinelPath,
        sentinelValue,
        waitProjectReady,
      );
    });

    if (cleanup_on_success) {
      await runStep("cleanup", async () => {
        if (project_id) {
          await deleteProject({ project_id, skipPermissionCheck: true });
        }
        if (cleanup_host ?? createdHost) {
          if (!host_id) throw new Error("missing host_id for cleanup");
          await deleteHost({ account_id, id: host_id });
        }
      });
    }

    return {
      ok: true,
      host_id,
      project_id,
      steps,
    };
  } catch (err) {
    emit({
      step: "run",
      status: "failed",
      message: `${err}`,
    });
    return {
      ok: false,
      host_id,
      project_id,
      steps,
    };
  }
}

export async function runProjectHostPersistenceSmokeTest(
  opts: ProjectHostSmokeOptions,
): Promise<ProjectHostSmokeResult> {
  return await runSmokeSteps({
    account_id: opts.account_id,
    createSpec: opts.create,
    update: opts.update,
    wait: opts.wait,
    cleanup_on_success: opts.cleanup_on_success,
    cleanup_host: true,
    log: opts.log,
  });
}

export async function runProjectHostPersistenceSmokeTestForHostId({
  host_id,
  update,
  wait,
  cleanup_on_success,
  log,
}: {
  host_id: string;
  update?: ProjectHostSmokeOptions["update"];
  wait?: ProjectHostSmokeOptions["wait"];
  cleanup_on_success?: ProjectHostSmokeOptions["cleanup_on_success"];
  log?: ProjectHostSmokeOptions["log"];
}): Promise<ProjectHostSmokeResult> {
  const { rows } = await getPool().query(
    "SELECT name, status, metadata FROM project_hosts WHERE id=$1 AND deleted IS NULL",
    [host_id],
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`host ${host_id} not found`);
  }
  const metadata = row.metadata ?? {};
  const account_id = metadata.owner;
  if (!account_id) {
    throw new Error("host has no owner; cannot run smoke test");
  }
  const existingStatus = row.status ?? "unknown";
  if (
    !["off", "deprovisioned", "error", "starting", "running"].includes(
      existingStatus,
    )
  ) {
    log?.({
      step: "precheck",
      status: "failed",
      message: `host status is ${existingStatus}; expected off/deprovisioned`,
    });
  }

  return await runSmokeSteps({
    account_id,
    host_id,
    hostStatus: existingStatus,
    update,
    wait,
    cleanup_on_success,
    cleanup_host: false,
    log,
  });
}

type CatalogEntry = {
  kind: string;
  scope: string;
  payload: any;
};

async function loadCatalogEntries(
  provider: ProviderId,
): Promise<CatalogEntry[]> {
  const { rows } = await getPool().query(
    `SELECT kind, scope, payload
       FROM cloud_catalog_cache
      WHERE provider=$1`,
    [provider],
  );
  return rows as CatalogEntry[];
}

function getCatalogPayload<T>(
  entries: CatalogEntry[],
  kind: string,
  scope: string,
): T | undefined {
  return entries.find((entry) => entry.kind === kind && entry.scope === scope)
    ?.payload as T | undefined;
}

function pickDifferent<T>(
  items: T[],
  current?: T,
  predicate?: (value: T) => boolean,
): T | undefined {
  for (const item of items) {
    if (predicate && !predicate(item)) continue;
    if (current !== undefined && item === current) continue;
    return item;
  }
  return undefined;
}

async function buildPresetForGcp(): Promise<SmokePreset | undefined> {
  const entries = await loadCatalogEntries("gcp");
  const regions =
    getCatalogPayload<Array<{ name: string; zones: string[] }>>(
      entries,
      "regions",
      "global",
    ) ?? [];
  const zones =
    getCatalogPayload<Array<{ name: string }>>(entries, "zones", "global") ??
    [];
  const zoneNames = new Set(zones.map((z) => z.name));

  let region: string | undefined;
  let zone: string | undefined;
  let machineTypes: Array<{ name?: string; guestCpus?: number }> = [];

  for (const candidate of regions) {
    if (!candidate.name.startsWith("us-west")) {
      continue;
    }
    const candidateZones = (candidate.zones ?? []).filter((z) =>
      zoneNames.has(z),
    );
    for (const z of candidateZones) {
      const types =
        getCatalogPayload<any[]>(entries, "machine_types", `zone/${z}`) ?? [];
      if (!types.length) continue;
      region = candidate.name;
      zone = z;
      machineTypes = types;
      break;
    }
    if (region && zone) break;
  }
  if (!region || !zone || !machineTypes.length) return undefined;

  const sorted = machineTypes
    .filter((entry) => !!entry?.name)
    .sort((a, b) => (a.guestCpus ?? 0) - (b.guestCpus ?? 0));
  const primary =
    sorted.find((entry) => (entry.guestCpus ?? 0) >= 2) ?? sorted[0];
  if (!primary?.name) return undefined;
  const fallbackUpdate = pickDifferent(sorted, primary);
  const updateType = fallbackUpdate?.name ?? undefined;

  return {
    id: "gcp-cpu",
    label: `GCP CPU (${region}/${zone})`,
    provider: "gcp",
    create: {
      name: `smoke-gcp-${Date.now()}`,
      region,
      size: primary.name,
      gpu: false,
      machine: {
        cloud: "gcp",
        zone,
        machine_type: primary.name,
        disk_gb: 100,
        disk_type: "balanced",
        storage_mode: "persistent",
      },
    },
    update: updateType ? { machine_type: updateType } : undefined,
  };
}

async function buildPresetForNebius(): Promise<SmokePreset | undefined> {
  const entries = await loadCatalogEntries("nebius");
  const regions =
    getCatalogPayload<Array<{ name: string }>>(entries, "regions", "global") ??
    [];
  const instanceTypes =
    getCatalogPayload<Array<{ name: string; gpus?: number; vcpus?: number }>>(
      entries,
      "instance_types",
      "global",
    ) ?? [];
  const region = regions[0]?.name;
  if (!region || !instanceTypes.length) return undefined;

  const primary =
    instanceTypes.find((entry) => (entry.gpus ?? 0) === 0) ?? instanceTypes[0];
  const updateType =
    pickDifferent(instanceTypes, primary, (entry) => entry?.name !== undefined)
      ?.name ?? undefined;

  return {
    id: "nebius-cpu",
    label: `Nebius CPU (${region})`,
    provider: "nebius",
    create: {
      name: `smoke-nebius-${Date.now()}`,
      region,
      size: primary.name,
      gpu: false,
      machine: {
        cloud: "nebius",
        machine_type: primary.name,
        disk_gb: 100,
        disk_type: "ssd_io_m3",
        storage_mode: "persistent",
      },
    },
    update: updateType ? { machine_type: updateType } : undefined,
  };
}

async function buildPresetForHyperstack(): Promise<SmokePreset | undefined> {
  const entries = await loadCatalogEntries("hyperstack");
  const regions =
    getCatalogPayload<Array<{ name: string }>>(entries, "regions", "global") ??
    [];
  const flavors =
    getCatalogPayload<Array<{ region_name: string; flavors: Array<any> }>>(
      entries,
      "flavors",
      "global",
    ) ?? [];
  const region = regions[0]?.name ?? flavors[0]?.region_name;
  if (!region) return undefined;
  const flavorList =
    flavors.find((entry) => entry.region_name === region)?.flavors ?? [];
  if (!flavorList.length) return undefined;
  const primary =
    flavorList.find((entry) => (entry.gpu_count ?? 0) === 0) ?? flavorList[0];
  const updateFlavor = pickDifferent(flavorList, primary)?.name ?? undefined;

  return {
    id: "hyperstack-cpu",
    label: `Hyperstack CPU (${region})`,
    provider: "hyperstack",
    create: {
      name: `smoke-hyperstack-${Date.now()}`,
      region,
      size: primary.name,
      gpu: (primary.gpu_count ?? 0) > 0,
      machine: {
        cloud: "hyperstack",
        machine_type: primary.name,
        disk_gb: primary.disk ?? 50,
        storage_mode: "persistent",
      },
    },
    update: updateFlavor ? { machine_type: updateFlavor } : undefined,
    wait: {
      host_running: { intervalMs: 10000, attempts: 180 },
      project_ready: { intervalMs: 5000, attempts: 120 },
    },
  };
}

async function buildPresetForLambda(): Promise<SmokePreset | undefined> {
  const entries = await loadCatalogEntries("lambda");
  const instanceTypes =
    getCatalogPayload<
      Array<{ name: string; regions: string[]; gpus?: number }>
    >(entries, "instance_types", "global") ?? [];
  if (!instanceTypes.length) return undefined;

  const primary =
    instanceTypes.find((entry) => (entry.gpus ?? 0) === 0) ?? instanceTypes[0];
  const region = primary.regions?.[0];
  if (!region) return undefined;
  const updateType = pickDifferent(instanceTypes, primary)?.name ?? undefined;

  return {
    id: "lambda-cpu",
    label: `Lambda CPU (${region})`,
    provider: "lambda",
    create: {
      name: `smoke-lambda-${Date.now()}`,
      region,
      size: primary.name,
      gpu: (primary.gpus ?? 0) > 0,
      machine: {
        cloud: "lambda",
        machine_type: primary.name,
        storage_mode: "persistent",
        metadata: {
          instance_type_name: primary.name,
        },
      },
    },
    update: updateType ? { machine_type: updateType } : undefined,
  };
}

export async function listProjectHostSmokePresets({
  provider,
}: {
  provider: ProviderId | string;
}): Promise<SmokePreset[]> {
  const normalized = normalizeProviderId(provider);
  if (!normalized) return [];
  switch (normalized) {
    case "gcp": {
      const preset = await buildPresetForGcp();
      return preset ? [preset] : [];
    }
    case "nebius": {
      const preset = await buildPresetForNebius();
      return preset ? [preset] : [];
    }
    case "hyperstack": {
      const preset = await buildPresetForHyperstack();
      return preset ? [preset] : [];
    }
    case "lambda": {
      const preset = await buildPresetForLambda();
      return preset ? [preset] : [];
    }
    default:
      return [];
  }
}

export async function runProjectHostPersistenceSmokePreset({
  account_id,
  provider,
  preset,
}: {
  account_id: string;
  provider: ProviderId | string;
  preset?: string;
}): Promise<ProjectHostSmokeResult> {
  const presets = await listProjectHostSmokePresets({ provider });
  if (!presets.length) {
    throw new Error(`no smoke presets available for ${provider}`);
  }
  if (!preset) {
    preset = presets[0].id;
  }
  const selected =
    (preset && presets.find((p) => p.id === preset)) ?? presets[0];
  if (!selected) {
    throw new Error(`smoke preset ${preset} not found for ${provider}`);
  }
  return await runProjectHostPersistenceSmokeTest({
    account_id,
    create: {
      ...selected.create,
      account_id,
    },
    update: selected.update,
    wait: selected.wait,
    cleanup_on_success: true,
  });
}
