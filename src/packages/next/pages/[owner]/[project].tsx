// Page for a project that is owned by a named account
// or organization.

import getProjectId from "lib/names/project";
import withCustomize from "lib/with-customize";
import getProjectTitle from "lib/share/get-project";
import getProject from "lib/project/info";
import Project from "components/project/project";

export default Project;

export async function getServerSideProps(context) {
  const { owner, project } = context.params;
  try {
    const project_id = await getProjectId(owner, project);
    const { title } = await getProjectTitle(project_id);
    const props = { ...(await getProject(project_id)), projectTitle: title };
    return withCustomize({ context, props });
  } catch (_err) {
    return { notFound: true };
  }
}
