/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { reuseInFlight } from "async-await-utils/hof";
import { webapp_client } from "../../webapp-client";
import { field_cmp, cmp_Date } from "smc-util/misc";
import { SiteLicense } from "smc-util/db-schema/site-licenses";

type FunctionType = () => Promise<SiteLicense[]>;

export const getManagedLicenses: FunctionType = reuseInFlight(async () => {
  const v = (
    await webapp_client.async_query({
      query: {
        manager_site_licenses: [
          {
            id: null,
            title: null,
            description: null,
            info: null,
            expires: null,
            activates: null,
            created: null,
            last_used: null,
            managers: null,
            upgrades: null,
            quota: null,
            run_limit: null,
            apply_limit: null,
          },
        ],
      },
    })
  ).query.manager_site_licenses;
  // Sort by created with newest first
  return v.sort((a, b) => cmp_Date(b.created, a.created));
});

// Return list of id's of projects that have at least one license applied to
// them. The license may or may not be valid, in use, etc.
export function projects_with_licenses(
  project_map: undefined | Map<string, any>
): { last_edited?: Date; project_id: string; num_licenses: number }[] {
  if (project_map == null) return [];
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
