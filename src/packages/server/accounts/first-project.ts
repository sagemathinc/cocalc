/* Create a first project for this user and add some content to it
   Inspired by the tags. */

import createProject from "@cocalc/server/projects/create";
import { getLogger } from "@cocalc/backend/logger";
import { getProject } from "@cocalc/server/projects/control";
import { isValidUUID } from "@cocalc/util/misc";

const log = getLogger("server:accounts:first-project");

export default async function firstProject({
  account_id,
  tags,
  ephemeral,
}: {
  account_id: string;
  tags?: string[];
  ephemeral?: number;
}): Promise<string> {
  log.debug(account_id, tags);
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  const project_id = await createProject({
    account_id,
    title: "My First Project",
    ephemeral,
  });
  log.debug("created new project", project_id);
  const project = getProject(project_id);
  await project.start();
  return project_id;
}
