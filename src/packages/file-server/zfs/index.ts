
export { getPools } from "./pools";
export {
  getModifiedFiles,
  deleteSnapshot,
  deleteExtraSnapshotsOfActiveProjects,
  deleteExtraSnapshots,
} from "./snapshots";
export { dbAllProjects, getRecentProjects } from "./db";
export { shareNFS, unshareNFS } from "./nfs";
export { createProject, deleteProject } from "./create";
export { createSnapshot } from "./snapshots";

import { dbProject, projectExists } from "./db";
import { createProject } from "./create";

export async function getProject(opts) {
  const exists = projectExists(opts);
  if (!exists) {
    // TODO: maybe a check for "transition from old format"...?
    // Or maybe we just populate the sqlite db with info about all
    // projects ever on initialization.
    return await createProject(opts);
  }
  const project = dbProject(opts);
  if (!project.archived) {
    return project;
  }
  if (project.archived) {
    throw Error("TODO:  de-archive project here and return that");
  }
}
