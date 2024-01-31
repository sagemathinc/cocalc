import { webapp_client } from "@cocalc/frontend/webapp-client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { throttle } from "lodash";
import { redux } from "@cocalc/frontend/app-framework";

const SYNC_ALL_THROTTLE_MS = 15000;
// sync files for all running compute servers in the given project, but
// will only log if there is an error, instead of throwing
const syncAllComputeServers1 = async (project_id: string) => {
  try {
    await syncAllComputeServers0(project_id);
  } catch (err) {
  }
};

// This exactly does it with no protection about being called too
// much, except it isn't called twice while running.  It can
// throw an exception.
const syncAllComputeServers0 = reuseInFlight(async (project_id: string) => {
  const store = redux.getProjectStore(project_id);
  const compute_servers = store.get("compute_servers")?.toJS();
  if (!compute_servers) return;
  const v: number[] = [];
  for (const id in compute_servers) {
    const server = compute_servers[id];
    if (server?.state == "running") {
      const s = server.detailed_state?.["filesystem"];
      if (s != null && s.time < s.expire) {
        v.push(parseInt(id));
      }
    }
  }
  if (v.length == 0) {
    return;
  }
  const api = await webapp_client.project_client.api(project_id);
  // launch sync for all of them.
  await Promise.all(v.map((id) => api.computeServerSyncRequest(id)));
});

const throttledFunctions: { [project_id: string]: Function } = {};
export const syncAllComputeServers = (project_id: string) => {
  let f = throttledFunctions[project_id];
  if (f == null) {
    // make a throttled function for each project
    f = throttledFunctions[project_id] = throttle(
      () => {
        syncAllComputeServers1(project_id);
      },
      SYNC_ALL_THROTTLE_MS,
      { leading: true, trailing: true },
    );
  }
  f();
};
