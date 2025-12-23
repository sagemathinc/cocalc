import { LocalProvider } from "../local";
import type { HostSpec } from "../types";

function buildSpec(overrides: Partial<HostSpec> = {}): HostSpec {
  return {
    name: "host-1",
    region: "us-west1",
    cpu: 2,
    ram_gb: 4,
    disk_gb: 20,
    disk_type: "balanced",
    ...overrides,
  };
}

describe("LocalProvider", () => {
  it("creates, reports status, stops, and deletes", async () => {
    const provider = new LocalProvider();
    const spec = buildSpec();
    const runtime = await provider.createHost(spec, {});
    expect(runtime.instance_id).toBe(spec.name);
    expect(await provider.getStatus(runtime, {})).toBe("running");
    await provider.stopHost(runtime, {});
    expect(await provider.getStatus(runtime, {})).toBe("stopped");
    await provider.startHost(runtime, {});
    expect(await provider.getStatus(runtime, {})).toBe("running");
    await provider.deleteHost(runtime, {});
    expect(await provider.getStatus(runtime, {})).toBe("error");
  });

  it("rejects duplicate names", async () => {
    const provider = new LocalProvider();
    const spec = buildSpec();
    await provider.createHost(spec, {});
    await expect(provider.createHost(spec, {})).rejects.toThrow(
      `${spec.name} already exists`,
    );
  });
});
