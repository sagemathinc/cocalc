import type { HostRuntime } from "@cocalc/cloud";

export type SmokeProvider = {
  createHost: () => Promise<HostRuntime>;
  deleteHost: (runtime: HostRuntime) => Promise<void>;
  startHost?: (runtime: HostRuntime) => Promise<void>;
  stopHost?: (runtime: HostRuntime) => Promise<void>;
  resizeDisk?: (runtime: HostRuntime, sizeGb: number) => Promise<void>;
  getStatus: (
    runtime: HostRuntime,
  ) => Promise<"starting" | "running" | "stopped" | "error">;
};

export type SmokeCapabilities = {
  supportsStop?: boolean;
  supportsDiskResize?: boolean;
  diskResizeRequiresStop?: boolean;
};

export type SmokeWaitOptions = {
  intervalMs: number;
  attempts: number;
};

export type SmokeStepResult = {
  name: string;
  status: "ok" | "failed" | "skipped";
  started_at: string;
  finished_at: string;
  error?: string;
};

export type SmokeRunResult = {
  ok: boolean;
  started_at: string;
  finished_at: string;
  steps: SmokeStepResult[];
  runtime?: HostRuntime;
};

export type SmokeRunnerOptions = {
  capabilities?: SmokeCapabilities;
  desiredDiskGb?: number;
  wait?: Partial<SmokeWaitOptions>;
  now?: () => Date;
  log?: (event: {
    step: string;
    status: "start" | "ok" | "failed" | "skipped";
    message?: string;
  }) => void;
};

type SmokeContext = {
  provider: SmokeProvider;
  runtime?: HostRuntime;
};

type SmokeStep = {
  name: string;
  run: (ctx: SmokeContext) => Promise<void>;
};

const DEFAULT_WAIT: SmokeWaitOptions = {
  intervalMs: 5000,
  attempts: 120,
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function waitOptions(opts?: SmokeRunnerOptions["wait"]): SmokeWaitOptions {
  return {
    intervalMs: opts?.intervalMs ?? DEFAULT_WAIT.intervalMs,
    attempts: opts?.attempts ?? DEFAULT_WAIT.attempts,
  };
}

async function waitForStatus(
  provider: SmokeProvider,
  runtime: HostRuntime,
  target: "running" | "stopped",
  opts: SmokeWaitOptions,
) {
  for (let attempt = 1; attempt <= opts.attempts; attempt += 1) {
    const status = await provider.getStatus(runtime);
    if (status === target) {
      return;
    }
    if (status === "error") {
      throw new Error(`status became error while waiting for ${target}`);
    }
    await sleep(opts.intervalMs);
  }
  throw new Error(`timeout waiting for ${target}`);
}

function defaultPlan(
  _ctx: SmokeContext,
  opts: SmokeRunnerOptions,
): SmokeStep[] {
  const caps = opts.capabilities ?? {};
  const steps: SmokeStep[] = [];
  const desiredDiskGb = opts.desiredDiskGb;
  const canStop = !!caps.supportsStop;
  const canResize = !!caps.supportsDiskResize && desiredDiskGb != null;
  const resizeRequiresStop = !!caps.diskResizeRequiresStop;
  const wait = waitOptions(opts.wait);

  steps.push({
    name: "create",
    run: async (inner) => {
      inner.runtime = await inner.provider.createHost();
    },
  });

  steps.push({
    name: "wait_running",
    run: async (inner) => {
      if (!inner.runtime) {
        throw new Error("runtime missing after create");
      }
      await waitForStatus(inner.provider, inner.runtime, "running", wait);
    },
  });

  if (canResize) {
    if (resizeRequiresStop && canStop) {
      steps.push({
        name: "stop_for_resize",
        run: async (inner) => {
          if (!inner.runtime || !inner.provider.stopHost) {
            throw new Error("stop not available");
          }
          await inner.provider.stopHost(inner.runtime);
          await waitForStatus(inner.provider, inner.runtime, "stopped", wait);
        },
      });
    }
    steps.push({
      name: "resize_disk",
      run: async (inner) => {
        if (!inner.runtime || !inner.provider.resizeDisk) {
          throw new Error("resize not available");
        }
        await inner.provider.resizeDisk(inner.runtime, desiredDiskGb ?? 0);
      },
    });
    if (resizeRequiresStop && canStop) {
      steps.push({
        name: "start_after_resize",
        run: async (inner) => {
          if (!inner.runtime || !inner.provider.startHost) {
            throw new Error("start not available");
          }
          await inner.provider.startHost(inner.runtime);
          await waitForStatus(inner.provider, inner.runtime, "running", wait);
        },
      });
    }
  }

  if (canStop && !resizeRequiresStop) {
    steps.push({
      name: "stop",
      run: async (inner) => {
        if (!inner.runtime || !inner.provider.stopHost) {
          throw new Error("stop not available");
        }
        await inner.provider.stopHost(inner.runtime);
        await waitForStatus(inner.provider, inner.runtime, "stopped", wait);
      },
    });
    steps.push({
      name: "start",
      run: async (inner) => {
        if (!inner.runtime || !inner.provider.startHost) {
          throw new Error("start not available");
        }
        await inner.provider.startHost(inner.runtime);
        await waitForStatus(inner.provider, inner.runtime, "running", wait);
      },
    });
  }

  steps.push({
    name: "delete",
    run: async (inner) => {
      if (!inner.runtime) {
        throw new Error("runtime missing before delete");
      }
      await inner.provider.deleteHost(inner.runtime);
    },
  });

  return steps;
}

export async function runSmokeTest(
  provider: SmokeProvider,
  opts: SmokeRunnerOptions = {},
): Promise<SmokeRunResult> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const steps: SmokeStepResult[] = [];
  const context: SmokeContext = { provider };
  let failed = false;
  const plan = defaultPlan(context, opts);

  for (const step of plan) {
    const startedAt = now();
    if (failed) {
      steps.push({
        name: step.name,
        status: "skipped",
        started_at: startedAt.toISOString(),
        finished_at: startedAt.toISOString(),
      });
      opts.log?.({ step: step.name, status: "skipped" });
      continue;
    }
    opts.log?.({ step: step.name, status: "start" });
    try {
      await step.run(context);
      const finishedAt = now();
      steps.push({
        name: step.name,
        status: "ok",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
      });
      opts.log?.({ step: step.name, status: "ok" });
    } catch (err) {
      const finishedAt = now();
      failed = true;
      steps.push({
        name: step.name,
        status: "failed",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
      opts.log?.({
        step: step.name,
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const finished = now();
  return {
    ok: !failed,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    steps,
    runtime: context.runtime,
  };
}
