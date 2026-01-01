import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import type { Host } from "@cocalc/conat/hub/api/hosts";

type HubClient = {
  hosts: {
    listHosts: (opts: Record<string, unknown>) => Promise<Host[]>;
  };
  purchases: {
    getMembership: (opts: Record<string, unknown>) => Promise<any>;
  };
};

type UseHostsOptions = {
  onError?: (err: unknown) => void;
  pollMs?: number;
  adminView?: boolean;
  includeDeleted?: boolean;
};

export const useHosts = (hub: HubClient, options: UseHostsOptions = {}) => {
  const {
    onError,
    pollMs = 15_000,
    adminView = false,
    includeDeleted = false,
  } = options;
  const [hosts, setHosts] = useState<Host[]>([]);
  const [canCreateHosts, setCanCreateHosts] = useState<boolean>(true);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const refresh = useCallback(async () => {
    const [list, membership] = await Promise.all([
      hub.hosts.listHosts({
        admin_view: adminView ? true : undefined,
        include_deleted: includeDeleted ? true : undefined,
      }),
      hub.purchases.getMembership({}),
    ]);
    setHosts(list);
    setCanCreateHosts(
      membership?.entitlements?.features?.create_hosts === true,
    );
    return list;
  }, [hub, adminView, includeDeleted]);

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load hosts", err);
      onErrorRef.current?.(err);
    });
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      refresh().catch((err) => {
        console.error("host refresh failed", err);
        onErrorRef.current?.(err);
      });
    }, pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  return { hosts, setHosts, refresh, canCreateHosts };
};
