import { useAsyncEffect } from "@cocalc/frontend/app-framework";
import { useState } from "react";
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
    setCounter(counter + 1);
  }, updateInterval);

  const refresh = () => setCounter(counter + 1);

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
    setTimeout(refresh, 1000);
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
    setTimeout(refresh, 1000);
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
