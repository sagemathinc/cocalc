/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  redux,
  useAsyncEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { SCHEMA } from "@cocalc/util/db-schema";
import { keys } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

export const FIX_BORDER = `1px solid ${COLORS.GRAY_L0}`;

export const FIX_BORDERS: React.CSSProperties = {
  borderTop: FIX_BORDER,
  borderRight: FIX_BORDER,
} as const;

// [hsy] This comes from project/settings.tsx and maybe there is a better way to do this
export function useProject(project_id) {
  const project_map = useTypedRedux("projects", "project_map");
  const [project, setProject] = useState<any>(null);

  const group = useMemo(
    () => redux.getStore("projects").get_my_group(project_id),
    [project_id]
  );

  useAsyncEffect(async () => {
    if (!group) return;
    if (group === "admin") {
      const query = {};
      for (const k of keys(SCHEMA.projects.user_query?.get?.fields)) {
        // Do **not** change the null here to undefined, which means something
        // completely different. See
        // https://github.com/sagemathinc/cocalc/issues/4137
        query[k] = k === "project_id" ? project_id : null;
      }
      const table = webapp_client.sync_client.sync_table(
        { projects_admin: query },
        []
      );
      table.on("change", () => {
        setProject(table.get(project_id));
      });
    } else {
      const p = project_map?.get(project_id);
      if (p != null && project != p) {
        setProject(p);
      }
    }
  }, [group, project_id, project_map]);

  const compute_image = project_map?.get(project_id)?.get("compute_image")

  return { project, group , compute_image};
}
