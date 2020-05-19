import { Map } from "immutable";
import { webapp_client } from "../../webapp-client";
import { field_cmp } from "smc-util/misc";

export async function getManagedLicenses(): Promise<string[]> {
  return (
    await webapp_client.async_query({
      query: {
        manager_site_licenses: [{ id: null }],
      },
    })
  ).query.manager_site_licenses.map((x) => x.id);
}

// Return list of id's of projects that have at least one license applied to
// them. The license may or may not be valid, in use, etc.
export function projects_with_licenses(
  project_map: Map<string, any>
): { last_edited?: Date; project_id: string; num_licenses: number }[] {
  const v: {
    last_edited?: Date;
    project_id: string;
    num_licenses: number;
  }[] = [];
  for (const y of project_map) {
    const [project_id, project] = y;
    const num_licenses = project.get("site_license")?.size;
    if (num_licenses > 0) {
      v.push({
        last_edited: project.get("last_edited"),
        project_id,
        num_licenses,
      });
    }
  }
  v.sort(field_cmp("last_edited"));
  v.reverse();
  return v;
}
