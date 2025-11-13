import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useMemo } from "react";
import { Map } from "immutable";

export default function useLicenses({ project_id }) {
  const project_map = useTypedRedux("projects", "project_map");
  const project = useMemo(
    () => project_map?.get(project_id),
    [project_id, project_map],
  );
  if (project == null) {
    return null;
  }
  return project.get("site_license") ?? Map();
}
