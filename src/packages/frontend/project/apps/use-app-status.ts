import { useAsyncEffect } from "@cocalc/frontend/app-framework";
import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { useInterval } from "react-interval-hook";

export function useAppStatus({
  name,
  updateInterval = 30_000,
}: {
  name: string;
  updateInterval?: number;
}) {
  const { project_id } = useProjectContext();
  const [status, setStatus] = useState<any>(null);
  const [counter, setCounter] = useState<number>(0);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useAsyncEffect(async () => {
    const api = webapp_client.conat_client.projectApi({ project_id });
    try {
      setLoading(true);
      setError(null);
      setStatus(await api.apps.status(name));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [counter, name]);

  useInterval(() => {
    setCounter((prev) => prev + 1);
  }, updateInterval);

  const refresh = () => setCounter((prev) => prev + 1);

  useEffect(() => {
    if (status?.state !== "running" || status?.ready === true) {
      return;
    }
    let cancelled = false;
    const api = webapp_client.conat_client.projectApi({ project_id });
    (async () => {
      while (!cancelled) {
        try {
          const ready = await api.apps.waitForState(name, "running", {
            timeout: 10000,
            interval: 1000,
          });
          if (cancelled) {
            return;
          }
          if (ready) {
            refresh();
            return;
          }
        } catch (err) {
          if (!cancelled) {
            setError(err);
          }
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name, project_id, status?.state, status?.ready]);

  const start = async () => {
    const api = webapp_client.conat_client.projectApi({ project_id });
    try {
      setLoading(true);
      setError(null);
      await api.apps.start(name);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    refresh();
  };

  const stop = async () => {
    const api = webapp_client.conat_client.projectApi({ project_id });
    try {
      setLoading(true);
      setError(null);
      await api.apps.stop(name);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    refresh();
  };

  return {
    loading,
    status,
    error,
    setError,
    refresh,
    start,
    stop,
  };
}
