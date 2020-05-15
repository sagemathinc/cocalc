import { Map } from "immutable";
import { webapp_client } from "../../webapp-client";

export async function getManagedLicenses(): Promise<string[]> {
  return (
    await webapp_client.async_query({
      query: {
        manager_site_licenses: [{ id: null }],
      },
    })
  ).query.manager_site_licenses.map((x) => x.id);
}

interface InfoAboutLicense {
  upgraded_project_ids: string[]; // projects that you are a collab on that this license is applied to and it is actively upgrading it.
  applied_project_ids: string[]; // projects you are a collab on that this license is applied to but not actively upgrading
}

export function applied_licenses_info(
  project_map: Map<string, any>
): { [id: string]: InfoAboutLicense } {
  const x: { [id: string]: InfoAboutLicense } = {};
  for (const y of project_map) {
    const [project_id, project] = y;
    const v = project.get("site_license");
    if (v != null) {
      for (const z of v) {
        const [id, upgrade] = z;
        if (
          upgrade.size > 0 &&
          project.getIn(["state", "state"]) == "running"
        ) {
          if (x[id] == null) {
            x[id] = {
              upgraded_project_ids: [project_id],
              applied_project_ids: [],
            };
          } else {
            x[id].upgraded_project_ids.push(project_id);
          }
        } else {
          if (x[id] == null) {
            x[id] = {
              applied_project_ids: [project_id],
              upgraded_project_ids: [],
            };
          } else {
            x[id].applied_project_ids.push(project_id);
          }
        }
      }
    }
  }
  return x;
}
