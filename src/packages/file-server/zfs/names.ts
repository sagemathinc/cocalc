import { join } from "path";
import { PROJECTS, ARCHIVES, BUP } from "./config";

export function namespaceDataset({ pool, namespace }) {
  return `${pool}/${namespace}`;
}

// Archives
// There is one single dataset for each namespace/pool pair: All the different
// archives across projects are stored in the *same* dataset, since there is no
// point in separating them.
export function archivesDataset({ pool, namespace }) {
  return `${namespaceDataset({ pool, namespace })}/archives`;
}

export function archivesMountpoint({ pool, namespace }) {
  return join(ARCHIVES, namespace, pool);
}

export function projectArchivePath({ pool, namespace, project_id }) {
  return join(archivesMountpoint({ pool, namespace }), project_id);
}

// Bup
export function bupDataset({ pool, namespace }) {
  return `${namespaceDataset({ pool, namespace })}/bup`;
}

export function bupMountpoint({ pool, namespace }) {
  return join(BUP, namespace, pool);
}

export function bupProjectMountpoint({ pool, namespace, project_id }) {
  return join(bupMountpoint({ pool, namespace }), project_id);
}

// Projects

export function projectsPath({ namespace }) {
  return join(PROJECTS, namespace);
}

export function projectMountpoint({ project_id, namespace }) {
  return join(projectsPath({ namespace }), project_id);
}

export function projectsDataset({ pool, namespace }) {
  return `${namespaceDataset({ pool, namespace })}/projects`;
}

// There is one single dataset for each project_id/namespace/pool tripple since it
// is critical to separate each project to properly support snapshots, clones,
// backups, etc.
export function projectDataset({ pool, project_id, namespace }) {
  return `${projectsDataset({ pool, namespace })}/${project_id}`;
}

// NOTE: We use "join" for actual file paths and explicit
// strings with / for ZFS filesystem names, since in some whacky
// futuristic world maybe this server is running on MS Windows.
