import getCollaborators from "lib/share/get-collaborators";
import getPublicPaths from "lib/share/get-public-paths";

export default async function getProjectInfo(project_id: string) {
  return {
    publicPaths: await getPublicPaths(project_id),
    collaborators: await getCollaborators(project_id),
  };
}
