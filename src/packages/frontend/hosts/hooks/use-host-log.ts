import { useEffect, useState } from "@cocalc/frontend/app-framework";

type HostLogEntry = {
  id: string;
  ts?: string | null;
  action: string;
  status: string;
  provider?: string | null;
  error?: string | null;
};

type HubClient = {
  hosts: {
    getHostLog: (opts: { id: string; limit?: number }) => Promise<HostLogEntry[]>;
  };
};

type UseHostLogOptions = {
  limit?: number;
  enabled?: boolean;
};

export const useHostLog = (
  hub: HubClient,
  hostId?: string,
  options: UseHostLogOptions = {},
) => {
  const { limit = 50, enabled = true } = options;
  const [hostLog, setHostLog] = useState<HostLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!hostId || !enabled) {
      setHostLog([]);
      return () => {
        mounted = false;
      };
    }
    setLoadingLog(true);
    (async () => {
      try {
        const entries = await hub.hosts.getHostLog({ id: hostId, limit });
        if (mounted) setHostLog(entries);
      } catch (err) {
        if (mounted) setHostLog([]);
        console.warn("getHostLog failed", err);
      } finally {
        if (mounted) setLoadingLog(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [hostId, enabled, limit, hub.hosts]);

  return { hostLog, loadingLog };
};
