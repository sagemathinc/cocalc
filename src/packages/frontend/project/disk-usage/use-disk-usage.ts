// hook to keep track of disk usage and quota in a project

import dust, { key } from "./dust";
import getQuota from "./quota";
import { useAsyncEffect } from "@cocalc/frontend/app-framework";
import { useRef, useState } from "react";

export default function useDiskUsage({
  project_id,
  path = "",
  compute_server_id = 0,
}: {
  project_id: string;
  path?: string;
  compute_server_id?: number;
}) {
  const [counter, setCounter] = useState<number>(0);
  const lastCounterRef = useRef<number>(0);
  const [usage, setUsage] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [quota, setQuota] = useState<{ used: number; size: number } | null>(
    null,
  );
  const currentRef = useRef<any>(`${project_id}-${path}-${compute_server_id}`);
  currentRef.current = key({ project_id, path, compute_server_id });

  useAsyncEffect(async () => {
    try {
      setError(null);
      setLoading(true);
      const x = await dust({
        project_id,
        path,
        compute_server_id,
        cache: counter == lastCounterRef.current,
      });
      if (!key({ project_id, path, compute_server_id }) == currentRef.current) {
        return;
      }
      setUsage(x);
      setQuota(
        await getQuota({
          project_id,
          compute_server_id,
          cache: counter == lastCounterRef.current,
        }),
      );
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    lastCounterRef.current = counter;
  }, [project_id, path, compute_server_id, counter]);

  return {
    quota,
    usage,
    loading,
    error,
    setError,
    refresh: () => {
      setCounter(counter + 1);
    },
  };
}
