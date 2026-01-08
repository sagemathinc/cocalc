import type {
  CloudProvider,
  HostRuntime,
  HostSpec,
  RemoteInstance,
} from "./types";
import logger from "./logger";

// Local provider for dev/tests. This does not create real VMs; it just
// tracks a small in-memory lifecycle state so higher-level code can be tested.
export class LocalProvider implements CloudProvider {
  private readonly states = new Map<string, "running" | "stopped">();

  mapStatus(status?: string): string | undefined {
    if (!status) return undefined;
    const normalized = status.toLowerCase();
    if (normalized === "running") return "running";
    if (normalized === "off" || normalized === "stopped") return "off";
    return "starting";
  }

  async createHost(spec: HostSpec, _creds: any): Promise<HostRuntime> {
    logger.info("local.createHost", { name: spec.name });
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
    logger.info("local.startHost", { instance_id: runtime.instance_id });
    this.states.set(runtime.instance_id, "running");
  }

  async stopHost(runtime: HostRuntime, _creds: any): Promise<void> {
    logger.info("local.stopHost", { instance_id: runtime.instance_id });
    this.states.set(runtime.instance_id, "stopped");
  }

  async restartHost(runtime: HostRuntime, _creds: any): Promise<void> {
    logger.info("local.restartHost", { instance_id: runtime.instance_id });
    this.states.set(runtime.instance_id, "running");
  }

  async hardRestartHost(runtime: HostRuntime, _creds: any): Promise<void> {
    logger.info("local.hardRestartHost", { instance_id: runtime.instance_id });
    this.states.set(runtime.instance_id, "running");
  }

  async deleteHost(runtime: HostRuntime, _creds: any): Promise<void> {
    logger.info("local.deleteHost", { instance_id: runtime.instance_id });
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

  async listInstances(
    _creds: any,
    opts?: { namePrefix?: string },
  ): Promise<RemoteInstance[]> {
    const instances: RemoteInstance[] = [];
    for (const [instance_id, status] of this.states.entries()) {
      if (opts?.namePrefix && !instance_id.startsWith(opts.namePrefix)) continue;
      instances.push({
        instance_id,
        name: instance_id,
        status,
        public_ip: "127.0.0.1",
      });
    }
    return instances;
  }

  async getInstance(
    runtime: HostRuntime,
    _creds: any,
  ): Promise<RemoteInstance | undefined> {
    const status = this.states.get(runtime.instance_id);
    if (!status) return undefined;
    return {
      instance_id: runtime.instance_id,
      name: runtime.instance_id,
      status,
      public_ip: "127.0.0.1",
    };
  }
}
