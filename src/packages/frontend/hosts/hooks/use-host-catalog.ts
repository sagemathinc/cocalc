import { useEffect, useRef, useState } from "@cocalc/frontend/app-framework";
import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import type { HostProvider } from "../types";

type HubClient = {
  hosts: {
    getCatalog: (opts: { provider: HostProvider }) => Promise<HostCatalog>;
    updateCloudCatalog: (opts: { provider: HostProvider }) => Promise<void>;
  };
};

type UseHostCatalogOptions = {
  provider?: HostProvider;
  refreshProvider?: HostProvider;
  onError?: (message: string) => void;
};

export const useHostCatalog = (
  hub: HubClient,
  { provider, refreshProvider, onError }: UseHostCatalogOptions,
) => {
  const [catalog, setCatalog] = useState<HostCatalog | undefined>(undefined);
  const [catalogError, setCatalogError] = useState<string | undefined>(
    undefined,
  );
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!provider) {
      setCatalog(undefined);
      setCatalogError(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await hub.hosts.getCatalog({ provider });
        if (cancelled) return;
        setCatalog(data);
        setCatalogError(undefined);
      } catch (err: any) {
        if (cancelled) return;
        console.error("failed to load cloud catalog", err);
        const message =
          err?.message ?? "Unable to load cloud catalog (regions/zones).";
        setCatalog(undefined);
        setCatalogError(message);
        onErrorRef.current?.(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, hub]);

  const refreshCatalog = async (): Promise<boolean> => {
    if (!refreshProvider || catalogRefreshing) return false;
    setCatalogRefreshing(true);
    let success = true;
    try {
      await hub.hosts.updateCloudCatalog({ provider: refreshProvider });
      if (refreshProvider === provider) {
        const data = await hub.hosts.getCatalog({ provider: refreshProvider });
        setCatalog(data);
        setCatalogError(undefined);
      }
    } catch (err) {
      console.error(err);
      onErrorRef.current?.("Failed to update cloud catalog");
      success = false;
    } finally {
      setCatalogRefreshing(false);
    }
    return success;
  };

  return {
    catalog,
    catalogError,
    catalogRefreshing,
    refreshCatalog,
  };
};
