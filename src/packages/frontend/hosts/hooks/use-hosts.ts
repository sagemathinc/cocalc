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

const MEMBERSHIP_REFRESH_MS = 5 * 60_000;

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
  const lastMembershipRef = useRef(0);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const refreshMembership = useCallback(async () => {
    const now = Date.now();
    if (now - lastMembershipRef.current < MEMBERSHIP_REFRESH_MS) {
      return;
    }
    lastMembershipRef.current = now;
    try {
      const membership = await hub.purchases.getMembership({});
      setCanCreateHosts(
        membership?.entitlements?.features?.create_hosts === true,
      );
    } catch (err) {
      console.error("failed to load membership", err);
      onErrorRef.current?.(err);
    }
  }, [hub]);

  const refresh = useCallback(async () => {
    const list = await hub.hosts.listHosts({
      admin_view: adminView ? true : undefined,
      include_deleted: includeDeleted ? true : undefined,
    });
    setHosts(list);
    void refreshMembership();
    return list;
  }, [hub, adminView, includeDeleted, refreshMembership]);

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load hosts", err);
      onErrorRef.current?.(err);
    });
  }, [refresh]);

  useEffect(() => {
    refreshMembership().catch((err) => {
      console.error("failed to load membership", err);
      onErrorRef.current?.(err);
    });
  }, [refreshMembership]);

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
