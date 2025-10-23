import isCollaborator from "@cocalc/server/projects/is-collaborator";

export async function assertCollab({ account_id, project_id }) {
  if (!account_id) {
    throw Error("must be signed in");
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on project");
  }
}
