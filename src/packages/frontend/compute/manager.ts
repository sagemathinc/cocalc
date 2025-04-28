/*
Client side compute servers manager

Used from a browser client frontend to manage what compute servers
are available and how they are used for a given project.

When doing dev from the browser console, do:

  cc.client.project_client.computeServers(cc.current().project_id)
*/

import {
  computeServerManager,
  type ComputeServerManager,
} from "@cocalc/nats/compute/manager";

const computeServerManagerCache: {
  [project_id: string]: ComputeServerManager;
} = {};

// very simple cache with no ref counting or anything.
// close a manager only when closing the project.
export default function computeServers(
  project_id: string,
): ComputeServerManager {
  if (computeServerManagerCache[project_id]) {
    return computeServerManagerCache[project_id];
  }
  const M = computeServerManager({ project_id });
  computeServerManagerCache[project_id] = M;
  M.on("closed", () => {
    delete computeServerManagerCache[project_id];
  });
  return M;
}
