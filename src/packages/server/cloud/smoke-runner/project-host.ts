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

What it does:
- Creates a host and waits for it to be running.
- Creates and starts a project on that host.
- Writes a sentinel file via the file-server RPC.
- Stops the host, applies a machine edit, then starts it again.
- Restarts the project and verifies the sentinel file still exists.

Notes:
- This uses real cloud resources and may take several minutes.
- It leaves host/project artifacts on failure for manual inspection.
*/
import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { createProject } from "@cocalc/server/conat/api/projects";
import { start as startProject } from "@cocalc/server/conat/api/projects";
import { fsClient, fsSubject } from "@cocalc/conat/files/fs";
import {
  createHost,
  startHost,
  stopHost,
  updateHostMachine,
} from "@cocalc/server/conat/api/hosts";
import { conatWithProjectRouting } from "@cocalc/server/conat/route-client";

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

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
    }>(
      "SELECT status FROM project_hosts WHERE id=$1 AND deleted IS NULL",
      [host_id],
    );
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

async function waitForProjectFile(
  clientFactory: () => ReturnType<typeof conatWithProjectRouting>,
  project_id: string,
  path: string,
  expected: string,
  opts: WaitOptions,
) {
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
    }
    await sleep(opts.intervalMs);
  }
  throw new Error("timeout waiting for project file");
}

async function runSmokeSteps({
  account_id,
  host_id,
  createSpec,
  hostStatus,
  update,
  wait,
  cleanup_on_success,
  log,
}: {
  account_id: string;
  host_id?: string;
  createSpec?: Parameters<typeof createHost>[0];
  hostStatus?: string;
  update?: ProjectHostSmokeOptions["update"];
  wait?: ProjectHostSmokeOptions["wait"];
  cleanup_on_success?: ProjectHostSmokeOptions["cleanup_on_success"];
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
      const client = fsClient({
        client: clientFactory(),
        subject: fsSubject({ project_id }),
      });
      await client.mkdir(".smoke", { recursive: true });
      await client.writeFile(sentinelPath, sentinelValue);
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
      await startHost({ account_id, id: host_id });
      await waitForHostStatus(host_id, ["running"], waitHostRunning);
    });

    await runStep("start_project", async () => {
      if (!project_id) throw new Error("missing project_id");
      await startProject({ account_id, project_id });
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
      emit({
        step: "cleanup",
        status: "ok",
        message: "cleanup_on_success requested; leaving cleanup TODO",
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
    log,
  });
}
