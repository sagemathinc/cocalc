import { CHECK_IN_PATH } from "@cocalc/util/db-schema/compute-servers";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";

// cause the given compute server to check in, or all running compute
// servers in the project if compute_server_id isn't specified.
export async function checkIn({
  project_id,
  compute_server_id,
}: {
  project_id: string;
  compute_server_id: number;
}) {
  if (compute_server_id != null) {
    await webapp_client.project_client.exec({
      command: "touch",
      args: [CHECK_IN_PATH],
      project_id,
      compute_server_id,
    });
    return;
  }
}

// launches in parallel check in on all running projects; doesn't
// wait for response.
export function checkInAll(project_id) {
  const computeServers = redux
    .getProjectStore(project_id)
    .get("compute_servers");
  if (computeServers == null) {
    return;
  }
  const ids = computeServers
    .filter((x) => x.get("state") == "running")
    .map((x) => x.get("id"))
    .keySeq();
  for (const id of ids) {
    (async () => {
      try {
        await checkIn({ project_id, compute_server_id: id });
      } catch (err) {
        console.warn(`checkIn issue with compute server ${id}`, err);
      }
    })();
  }
}
