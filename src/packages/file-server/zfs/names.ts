import { join } from "path";

const PROJECTS = "/projects";

export function namespaceMountpoint({ namespace }) {
  return join(PROJECTS, namespace);
}

export function projectMountpoint({ project_id, namespace }) {
  return join(namespaceMountpoint({ namespace }), project_id);
}

export function projectDataset({ pool, project_id, namespace }) {
  return `${pool}/${namespace}/${project_id}`;
}
