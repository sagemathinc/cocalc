import { message } from "antd";
import type { Host } from "@cocalc/conat/hub/api/hosts";

type HubClient = {
  hosts: {
    startHost: (opts: { id: string }) => Promise<unknown>;
    stopHost: (opts: { id: string }) => Promise<unknown>;
    deleteHost: (opts: { id: string }) => Promise<unknown>;
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

  const removeHost = async (id: string) => {
    try {
      await hub.hosts.deleteHost({ id });
      await refresh();
    } catch (err) {
      console.error(err);
      message.error("Failed to delete host");
    }
  };

  return { setStatus, removeHost };
};
