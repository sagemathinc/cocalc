import { redux } from "@cocalc/frontend/app-framework";
import { field_cmp } from "@cocalc/util/misc";

export async function getRecentRegions(project_id): Promise<string[]> {
  const computeServers = redux
    .getProjectStore(project_id)
    .get("compute_servers");
  if (computeServers == null) {
    return [];
  }
  const v: { last_edited: Date; region: string }[] = [];
  for (const [, x] of computeServers) {
    const last_edited = x.get("last_edited");
    if (last_edited == null) continue;
    const region = x.getIn(["configuration", "region"]);
    if (region == null) continue;
    v.push({ last_edited, region });
  }
  const regions = v
    .sort(field_cmp("last_edited"))
    .map(({ region }) => region)
    .reverse();
  const w: string[] = [];
  for (const region of regions) {
    if (!w.includes(region)) {
      w.push(region);
    }
  }
  return w;
}
