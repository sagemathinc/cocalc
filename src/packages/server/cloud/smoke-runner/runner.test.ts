import { runSmokeTest } from "./runner";

describe("smoke runner", () => {
  it("runs the default plan end-to-end", async () => {
    const calls: string[] = [];
    let status: "starting" | "running" | "stopped" = "starting";

    const provider = {
      createHost: async () => {
        calls.push("create");
        status = "starting";
        return {
          provider: "gcp" as const,
          instance_id: "i-1",
          ssh_user: "ubuntu",
        };
      },
      deleteHost: async () => {
        calls.push("delete");
      },
      startHost: async () => {
        calls.push("start");
        status = "running";
      },
      stopHost: async () => {
        calls.push("stop");
        status = "stopped";
      },
      resizeDisk: async (_runtime, sizeGb) => {
        calls.push(`resize:${sizeGb}`);
      },
      getStatus: async () => {
        if (status === "starting") {
          status = "running";
        }
        return status;
      },
    };

    const result = await runSmokeTest(provider, {
      capabilities: {
        supportsStop: true,
        supportsDiskResize: true,
      },
      desiredDiskGb: 120,
      wait: { intervalMs: 1, attempts: 3 },
    });

    expect(result.ok).toBe(true);
    expect(result.steps.every((step) => step.status === "ok")).toBe(true);
    expect(calls).toEqual([
      "create",
      "resize:120",
      "stop",
      "start",
      "delete",
    ]);
  });

  it("marks the failing step and skips the remainder", async () => {
    const calls: string[] = [];
    const provider = {
      createHost: async () => {
        calls.push("create");
        return {
          provider: "gcp" as const,
          instance_id: "i-2",
          ssh_user: "ubuntu",
        };
      },
      deleteHost: async () => {
        calls.push("delete");
      },
      startHost: async () => {
        calls.push("start");
      },
      stopHost: async () => {
        calls.push("stop");
      },
      resizeDisk: async () => {
        throw new Error("resize failed");
      },
      getStatus: async () => "running" as const,
    };

    const result = await runSmokeTest(provider, {
      capabilities: {
        supportsStop: true,
        supportsDiskResize: true,
      },
      desiredDiskGb: 50,
      wait: { intervalMs: 1, attempts: 1 },
    });

    const statuses = result.steps.map((step) => step.status);
    expect(statuses).toContain("failed");
    expect(statuses).toContain("skipped");
    expect(result.ok).toBe(false);
  });
});
