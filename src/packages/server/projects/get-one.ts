import create from "@cocalc/server/projects/create";
import getProjects from "@cocalc/server/projects/get";
import { isValidUUID } from "@cocalc/util/misc";

// This is also used by the latex api endpoint.
export default async function getOneProject(
  account_id
): Promise<{ project_id: string; title?: string }> {
  if (!isValidUUID(account_id)) {
    throw Error("getOneProject -- user must be authenticated");
  }
  const projects = await getProjects({ account_id, limit: 1 });
  if (projects.length >= 1) {
    return projects[0];
  }
  const title = "Untitled Project";
  return { project_id: await create({ account_id, title }), title };
}
