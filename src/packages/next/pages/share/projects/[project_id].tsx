/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Page for a given project.
Show all the public paths in a given project, and maybe other information about the project?
*/

import { join } from "path";
import basePath from "lib/base-path";
import { isUUID } from "lib/share/util";
import withCustomize from "lib/with-customize";
import getProject from "lib/share/get-project";
import getProjectInfo from "lib/project/info";
import getProjectOwner from "lib/project/get-owner";
import getOwnerName from "lib/owner/get-name";
import Project from "components/project/project";

export default Project;

export async function getServerSideProps(context) {
  const { project_id } = context.params;
  if (!isUUID(project_id)) {
    return { notFound: true };
  }
  let props;
  try {
    const project = await getProject(project_id, [
      "name",
      "title",
      "description",
      "avatar_image_full",
    ]);
    if (project.name) {
      // This project probably has a nice vanity name. Possibly redirect to that instead.
      const owner_id = await getProjectOwner(project_id);
      const owner = await getOwnerName(owner_id);
      if (owner) {
        return { props: { redirect: join(basePath, owner, project.name) } };
      }
    }
    props = {
      project_id,
      ...(await getProjectInfo(project_id, context.req)),
      ...project,
    };
  } catch (_err) {
    // console.warn(_err)
    return { notFound: true };
  }

  return await withCustomize({ context, props });
}
