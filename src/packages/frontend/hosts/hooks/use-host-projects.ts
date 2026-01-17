import { React } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type {
  HostBackupStatus,
  HostProjectRow,
} from "@cocalc/conat/hub/api/hosts";

type Options = {
  hostId?: string;
  riskOnly?: boolean;
  limit?: number;
  enabled?: boolean;
};

type HostProjectsState = {
  rows: HostProjectRow[];
  summary?: HostBackupStatus;
  nextCursor?: string;
  hostLastSeen?: string;
};

export function useHostProjects({
  hostId,
  riskOnly = false,
  limit = 200,
  enabled = true,
}: Options) {
  const [state, setState] = React.useState<HostProjectsState>({
    rows: [],
  });
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchPage = React.useCallback(
    async (cursor?: string, append?: boolean) => {
      if (!hostId || !enabled) return;
      const client = webapp_client.conat_client?.hub?.hosts;
      if (!client?.listHostProjects) return;
      try {
        const response = await client.listHostProjects({
          id: hostId,
          limit,
          cursor,
          risk_only: riskOnly,
        });
        setState((prev) => ({
          rows: append ? prev.rows.concat(response.rows ?? []) : response.rows ?? [],
          summary: response.summary,
          nextCursor: response.next_cursor,
          hostLastSeen: response.host_last_seen,
        }));
        setError(null);
      } catch (err) {
        console.error("failed to load host projects", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [enabled, hostId, limit, riskOnly],
  );

  const refresh = React.useCallback(async () => {
    if (!hostId || !enabled) return;
    setLoading(true);
    await fetchPage(undefined, false);
    setLoading(false);
  }, [enabled, fetchPage, hostId]);

  const loadMore = React.useCallback(async () => {
    if (!hostId || !enabled) return;
    if (!state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPage(state.nextCursor, true);
    setLoadingMore(false);
  }, [enabled, fetchPage, hostId, loadingMore, state.nextCursor]);

  React.useEffect(() => {
    if (!hostId || !enabled) return;
    refresh().catch((err) => {
      console.error("failed to refresh host projects", err);
    });
  }, [enabled, hostId, refresh, riskOnly, limit]);

  return {
    ...state,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
  };
}
