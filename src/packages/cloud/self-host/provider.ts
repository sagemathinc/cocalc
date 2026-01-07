import type {
  CloudProvider,
  HostRuntime,
  HostSpec,
  RemoteInstance,
} from "../types";
import logger from "../logger";

type SelfHostCreds = {
  sendCommand: (
    connectorId: string,
    action: "create" | "start" | "stop" | "delete" | "status" | "resize",
    payload: Record<string, any>,
    opts?: { timeoutMs?: number },
  ) => Promise<any>;
};

const DEFAULT_SSH_USER = "ubuntu";
const DEFAULT_TIMEOUTS = {
  create: 10 * 60 * 1000,
  start: 5 * 60 * 1000,
  stop: 5 * 60 * 1000,
  delete: 5 * 60 * 1000,
  status: 60 * 1000,
};

function requireConnectorId(spec: HostSpec): string {
  const connectorId =
    spec.region ??
    spec.metadata?.connector_id ??
    spec.metadata?.connectorId;
  if (!connectorId) {
    throw new Error("self-host requires region set to connector id");
  }
  return connectorId;
}

function connectorFromRuntime(runtime: HostRuntime): string {
  const connectorId =
    runtime.metadata?.connector_id ??
    runtime.zone;
  if (!connectorId) {
    throw new Error("self-host runtime missing connector_id");
  }
  return connectorId;
}

function getHostId(spec: HostSpec): string | undefined {
  const hostId = spec.metadata?.host_id ?? spec.metadata?.hostId;
  return typeof hostId === "string" ? hostId : undefined;
}

function runtimeHostId(runtime: HostRuntime): string | undefined {
  const hostId = runtime.metadata?.host_id ?? runtime.metadata?.hostId;
  return typeof hostId === "string" ? hostId : undefined;
}

export class SelfHostProvider implements CloudProvider {
  private async send(
    creds: SelfHostCreds,
    connectorId: string,
    action: "create" | "start" | "stop" | "delete" | "status" | "resize",
    payload: Record<string, any>,
    timeoutMs: number,
  ) {
    if (!creds?.sendCommand) {
      throw new Error("self-host provider missing sendCommand");
    }
    return await creds.sendCommand(connectorId, action, payload, { timeoutMs });
  }

  async createHost(spec: HostSpec, creds: any): Promise<HostRuntime> {
    const connectorId = requireConnectorId(spec);
    const hostId = getHostId(spec);
    if (!hostId) {
      throw new Error("self-host create requires host_id");
    }
    const payload = {
      host_id: hostId,
      name: spec.name,
      image: spec.metadata?.image ?? undefined,
      cpus: spec.cpu,
      mem_gb: spec.ram_gb,
      disk_gb: spec.disk_gb,
      cloud_init: spec.metadata?.startup_script,
    };
    logger.debug("self-host.createHost", { connector_id: connectorId, name: spec.name });
    const result = await this.send(
      creds,
      connectorId,
      "create",
      payload,
      DEFAULT_TIMEOUTS.create,
    );
    const ipv4 = Array.isArray(result?.ipv4) ? result.ipv4 : [];
    return {
      provider: "self-host",
      instance_id: result?.name ?? spec.name,
      public_ip: ipv4[0],
      ssh_user: spec.metadata?.ssh_user ?? DEFAULT_SSH_USER,
      metadata: {
        connector_id: connectorId,
        host_id: hostId,
        instance_name: result?.name ?? spec.name,
      },
    };
  }

  async startHost(runtime: HostRuntime, creds: any): Promise<void> {
    const connectorId = connectorFromRuntime(runtime);
    const payload = {
      host_id: runtimeHostId(runtime),
      name: runtime.metadata?.instance_name ?? runtime.instance_id,
    };
    logger.debug("self-host.startHost", { connector_id: connectorId, instance: runtime.instance_id });
    await this.send(creds, connectorId, "start", payload, DEFAULT_TIMEOUTS.start);
  }

  async stopHost(runtime: HostRuntime, creds: any): Promise<void> {
    const connectorId = connectorFromRuntime(runtime);
    const payload = {
      host_id: runtimeHostId(runtime),
      name: runtime.metadata?.instance_name ?? runtime.instance_id,
    };
    logger.debug("self-host.stopHost", { connector_id: connectorId, instance: runtime.instance_id });
    await this.send(creds, connectorId, "stop", payload, DEFAULT_TIMEOUTS.stop);
  }

  async deleteHost(runtime: HostRuntime, creds: any): Promise<void> {
    const connectorId = connectorFromRuntime(runtime);
    const payload = {
      host_id: runtimeHostId(runtime),
      name: runtime.metadata?.instance_name ?? runtime.instance_id,
    };
    logger.debug("self-host.deleteHost", { connector_id: connectorId, instance: runtime.instance_id });
    await this.send(creds, connectorId, "delete", payload, DEFAULT_TIMEOUTS.delete);
  }

  async resizeDisk(
    runtime: HostRuntime,
    newSizeGb: number,
    creds: any,
  ): Promise<void> {
    const connectorId = connectorFromRuntime(runtime);
    const payload = {
      host_id: runtimeHostId(runtime),
      name: runtime.metadata?.instance_name ?? runtime.instance_id,
      disk_gb: newSizeGb,
    };
    logger.debug("self-host.resizeDisk", { connector_id: connectorId, instance: runtime.instance_id });
    await this.send(creds, connectorId, "resize", payload, DEFAULT_TIMEOUTS.start);
  }

  async getStatus(
    runtime: HostRuntime,
    creds: any,
  ): Promise<"starting" | "running" | "stopped" | "error"> {
    const connectorId = connectorFromRuntime(runtime);
    const payload = {
      host_id: runtimeHostId(runtime),
      name: runtime.metadata?.instance_name ?? runtime.instance_id,
    };
    const result = await this.send(
      creds,
      connectorId,
      "status",
      payload,
      DEFAULT_TIMEOUTS.status,
    );
    const rawState = String(result?.state ?? "").toLowerCase();
    if (rawState === "running") return "running";
    if (rawState === "stopped" || rawState === "off") return "stopped";
    if (rawState === "error") return "error";
    return "starting";
  }

  async getInstance(
    runtime: HostRuntime,
    creds: any,
  ): Promise<RemoteInstance | undefined> {
    const connectorId = connectorFromRuntime(runtime);
    const payload = {
      host_id: runtimeHostId(runtime),
      name: runtime.metadata?.instance_name ?? runtime.instance_id,
    };
    const result = await this.send(
      creds,
      connectorId,
      "status",
      payload,
      DEFAULT_TIMEOUTS.status,
    );
    if (!result) return undefined;
    const ipv4 = Array.isArray(result?.ipv4) ? result.ipv4 : [];
    return {
      instance_id: result?.name ?? runtime.instance_id,
      name: result?.name ?? runtime.instance_id,
      status: result?.state ?? undefined,
      public_ip: ipv4[0],
    };
  }
}
