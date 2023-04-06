import call from "@cocalc/server/projects/connection/call";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

export default async function callProject({
  account_id,
  project_id,
  mesg,
}): Promise<any> {
  if (!isValidUUID(account_id)) {
    throw Error("callProject -- user must be authenticated");
  }
  if (!isValidUUID(project_id)) {
    throw Error("callProject -- must specify project_id");
  }

  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("callProject -- authenticated user must be a collaborator on the project");
  }
  return await call({ project_id, mesg });
}
