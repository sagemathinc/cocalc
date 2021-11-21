import getCollaborators from "lib/share/get-collaborators";
import getPublicPaths from "lib/share/get-public-paths";

export default async function getProjectInfo(project_id: string, req) {
  return {
    publicPaths: await getPublicPaths(project_id, req),
    collaborators: await getCollaborators(project_id),
  };
}
