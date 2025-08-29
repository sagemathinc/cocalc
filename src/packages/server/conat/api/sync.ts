//import { conat } from "@cocalc/backend/conat";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

export async function history({
  account_id,
  project_id,
  path,
}: {
  account_id?: string;
  project_id: string;
  path: string;
}): Promise<any[]> {
  if (!account_id || !(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be collaborator on source project");
  }

  // const client = conat();
  // this will be much easier once the fs2 branch is merged
  throw Error(`not implemented yet -- can't get history of ${path} yet`);
}
