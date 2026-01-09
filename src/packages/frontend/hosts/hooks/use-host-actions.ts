import { message } from "antd";
import type { Host } from "@cocalc/conat/hub/api/hosts";

type HubClient = {
  hosts: {
    startHost: (opts: { id: string }) => Promise<unknown>;
    stopHost: (opts: { id: string }) => Promise<unknown>;
    restartHost?: (opts: {
      id: string;
      mode?: "reboot" | "hard";
    }) => Promise<unknown>;
    deleteHost: (opts: { id: string }) => Promise<unknown>;
    forceDeprovisionHost?: (opts: { id: string }) => Promise<unknown>;
    removeSelfHostConnector?: (opts: { id: string }) => Promise<unknown>;
    renameHost?: (opts: { id: string; name: string }) => Promise<unknown>;
    updateHostMachine?: (opts: {
      id: string;
      cpu?: number;
      ram_gb?: number;
      disk_gb?: number;
      disk_type?: "ssd" | "balanced" | "standard";
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
};

export const useHostActions = ({
  hub,
  setHosts,
  refresh,
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
        await hub.hosts.startHost({ id });
      } else {
        await hub.hosts.stopHost({ id });
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
      await hub.hosts.restartHost({ id, mode });
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
      await hub.hosts.deleteHost({ id });
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
      cpu?: number;
      ram_gb?: number;
      disk_gb?: number;
      disk_type?: "ssd" | "balanced" | "standard";
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
      await hub.hosts.forceDeprovisionHost({ id });
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
      await hub.hosts.removeSelfHostConnector({ id });
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
