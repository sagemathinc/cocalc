/*

- If compute server api isReady() returns true, then 'running'.

- If compute server api not ready, check state of compute server itself, as stored
  in the database (this is managed by a backend service).
  If compute server state is 'starting' or 'running', then api state is 'starting',
  otherwise api state is 'off'.

- If the server is in the running state but isReady() returned false, we
  wait a few seconds for the api to be ready, then try again.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { getServerState } from "./api";
import { useEffect, useRef, useState } from "react";
import { until } from "@cocalc/util/async-utils";
import { useIsMountedRef } from "@cocalc/frontend/app-framework";

export type State = "off" | "starting" | "running";
const TIMEOUT = 5000;

export default function useComputeServerApiState({
  project_id,
  compute_server_id,
}: {
  project_id?: string;
  compute_server_id?: number;
}): State | null {
  const isMountedRef = useIsMountedRef();
  const [state, setState] = useState<State | null>(null);
  const currentRef = useRef<{
    project_id?: string;
    compute_server_id?: number;
  }>({
    project_id,
    compute_server_id,
  });
  currentRef.current.project_id = project_id;
  currentRef.current.compute_server_id = compute_server_id;

  useEffect(() => {
    if (project_id == null || compute_server_id == null) {
      setState(null);
      return;
    }
    const isCurrent = () =>
      isMountedRef.current &&
      currentRef.current.project_id == project_id &&
      currentRef.current.compute_server_id == compute_server_id;
    const projectApi = webapp_client.conat_client.projectApi({
      project_id,
      compute_server_id,
    });
    (async () => {
      await until(
        async () => {
          if (!isCurrent()) return true;
          if (await projectApi.isReady()) {
            if (!isCurrent()) return true;
            setState("running");
            return false;
          }
          const s = await getServerState(compute_server_id);
          if (!isCurrent()) return true;
          if (s == "running" || s == "starting") {
            setState("starting");
          } else {
            setState("off");
          }

          // watch for change to running
          try {
            await projectApi.waitUntilReady({ timeout: TIMEOUT });
            if (!isCurrent()) return true;
            // didn't throw and is current, so must be running
            setState("running");
            return false;
          } catch {}
          if (!isCurrent()) return true;
          return false;
        },
        { min: 3000, max: 6000 },
      );
    })();

    return () => {
      setState(null);
    };
  }, [project_id, compute_server_id]);

  return state;
}
