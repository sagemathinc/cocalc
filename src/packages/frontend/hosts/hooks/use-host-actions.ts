import { message } from "antd";
import type { Host, HostLroResponse } from "@cocalc/conat/hub/api/hosts";

type HubClient = {
  hosts: {
    startHost: (opts: { id: string }) => Promise<HostLroResponse>;
    stopHost: (opts: { id: string }) => Promise<HostLroResponse>;
    restartHost?: (opts: {
      id: string;
      mode?: "reboot" | "hard";
    }) => Promise<HostLroResponse>;
    deleteHost: (opts: { id: string }) => Promise<HostLroResponse>;
    forceDeprovisionHost?: (opts: { id: string }) => Promise<HostLroResponse>;
    removeSelfHostConnector?: (opts: { id: string }) => Promise<HostLroResponse>;
    renameHost?: (opts: { id: string; name: string }) => Promise<unknown>;
    updateHostMachine?: (opts: {
      id: string;
      cloud?: string;
      cpu?: number;
      ram_gb?: number;
      disk_gb?: number;
      disk_type?: "ssd" | "balanced" | "standard" | "ssd_io_m3";
      machine_type?: string;
      gpu_type?: string;
      gpu_count?: number;
      storage_mode?: "ephemeral" | "persistent";
      region?: string;
      zone?: string;
    }) => Promise<unknown>;
  };
};

type UseHostActionsOptions = {
  hub: HubClient;
  setHosts: React.Dispatch<React.SetStateAction<Host[]>>;
  refresh: () => Promise<Host[]>;
  onHostOp?: (host_id: string, op: HostLroResponse) => void;
};

export const useHostActions = ({
  hub,
  setHosts,
  refresh,
  onHostOp,
}: UseHostActionsOptions) => {
  const setStatus = async (id: string, action: "start" | "stop") => {
    try {
      setHosts((prev) =>
        prev.map((h) =>
          h.id === id
            ? { ...h, status: action === "start" ? "starting" : "stopping" }
            : h,
        ),
      );
      if (action === "start") {
        const op = await hub.hosts.startHost({ id });
        onHostOp?.(id, op);
      } else {
        const op = await hub.hosts.stopHost({ id });
        onHostOp?.(id, op);
      }
    } catch (err) {
      console.error(err);
      message.error(`Failed to ${action} host`);
      return;
    }
    try {
      await refresh();
    } catch (err) {
      console.error("host refresh failed", err);
    }
  };

  const restartHost = async (id: string, mode: "reboot" | "hard") => {
    if (!hub.hosts.restartHost) {
      message.error("Restart not available");
      return;
    }
    try {
      setHosts((prev) =>
        prev.map((host) =>
          host.id === id ? { ...host, status: "restarting" } : host,
        ),
      );
      const op = await hub.hosts.restartHost({ id, mode });
      onHostOp?.(id, op);
    } catch (err) {
      console.error(err);
      message.error("Failed to restart host");
      return;
    }
    try {
      await refresh();
    } catch (err) {
      console.error("host refresh failed", err);
    }
  };

  const removeHost = async (id: string) => {
    try {
      const op = await hub.hosts.deleteHost({ id });
      onHostOp?.(id, op);
      await refresh();
    } catch (err) {
      console.error(err);
      message.error("Failed to delete host");
    }
  };

  const renameHost = async (id: string, name: string) => {
    const cleaned = name?.trim();
    if (!cleaned) {
      message.error("Host name cannot be empty");
      return;
    }
    try {
      if (!hub.hosts.renameHost) {
        message.error("Host rename not available");
        return;
      }
      await hub.hosts.renameHost({ id, name: cleaned });
      setHosts((prev) =>
        prev.map((host) => (host.id === id ? { ...host, name: cleaned } : host)),
      );
      await refresh();
    } catch (err) {
      console.error(err);
      message.error("Failed to rename host");
    }
  };

  const updateHostMachine = async (
    id: string,
    opts: {
      cloud?: string;
      cpu?: number;
      ram_gb?: number;
      disk_gb?: number;
      disk_type?: "ssd" | "balanced" | "standard" | "ssd_io_m3";
      machine_type?: string;
      gpu_type?: string;
      gpu_count?: number;
      storage_mode?: "ephemeral" | "persistent";
      region?: string;
      zone?: string;
    },
  ) => {
    if (!hub.hosts.updateHostMachine) {
      message.error("Host update not available");
      return;
    }
    try {
      await hub.hosts.updateHostMachine({ id, ...opts });
      await refresh();
    } catch (err) {
      console.error(err);
      message.error("Failed to update host resources");
    }
  };

  const forceDeprovision = async (id: string) => {
    if (!hub.hosts.forceDeprovisionHost) {
      message.error("Force deprovision not available");
      return;
    }
    try {
      const op = await hub.hosts.forceDeprovisionHost({ id });
      onHostOp?.(id, op);
      await refresh();
    } catch (err) {
      console.error(err);
      message.error("Failed to force deprovision host");
    }
  };

  const removeSelfHostConnector = async (id: string) => {
    if (!hub.hosts.removeSelfHostConnector) {
      message.error("Remove connector not available");
      return;
    }
    try {
      const op = await hub.hosts.removeSelfHostConnector({ id });
      onHostOp?.(id, op);
      await refresh();
    } catch (err) {
      console.error(err);
      message.error("Failed to remove connector");
    }
  };

  return {
    setStatus,
    restartHost,
    removeHost,
    renameHost,
    updateHostMachine,
    forceDeprovision,
    removeSelfHostConnector,
  };
};
