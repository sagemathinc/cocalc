import type { CloudProvider, HostRuntime, HostSpec } from "./types";

// Local provider for dev/tests. This does not create real VMs; it just
// tracks a small in-memory lifecycle state so higher-level code can be tested.
export class LocalProvider implements CloudProvider {
  private readonly states = new Map<string, "running" | "stopped">();

  async createHost(spec: HostSpec, _creds: any): Promise<HostRuntime> {
    if (this.states.has(spec.name)) {
      throw Error(`${spec.name} already exists`);
    }
    this.states.set(spec.name, "running");
    return {
      provider: "local",
      instance_id: spec.name,
      public_ip: spec.metadata?.public_ip ?? "127.0.0.1",
      ssh_user: spec.metadata?.ssh_user ?? "local",
      metadata: {
        note: "local provider (no VM created)",
      },
    };
  }

  async startHost(runtime: HostRuntime, _creds: any): Promise<void> {
    this.states.set(runtime.instance_id, "running");
  }

  async stopHost(runtime: HostRuntime, _creds: any): Promise<void> {
    this.states.set(runtime.instance_id, "stopped");
  }

  async deleteHost(runtime: HostRuntime, _creds: any): Promise<void> {
    this.states.delete(runtime.instance_id);
  }

  async resizeDisk(
    _runtime: HostRuntime,
    _newSizeGb: number,
    _creds: any,
  ): Promise<void> {
    return;
  }

  async getStatus(
    runtime: HostRuntime,
    _creds: any,
  ): Promise<"starting" | "running" | "stopped" | "error"> {
    const state = this.states.get(runtime.instance_id);
    if (state === "stopped") return "stopped";
    if (state === "running") return "running";
    return "error";
  }
}
