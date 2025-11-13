/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Page for a project that is owned by a named account
// or organization.

import getProjectId from "lib/names/project";
import withCustomize from "lib/with-customize";
import getProjectInfo from "lib/project/info";
import getProject from "lib/share/get-project";
import Project from "components/project/project";
import Organization from "components/share/proxy/organization";
import getPublicPathInfoGithub from "lib/share/proxy/get-public-path-info-github";

export default function Page(props) {
  if (props.project_id) {
    return <Project {...props} />;
  } else {
    // e.g., for listing all github repos in an org:
    return <Organization {...props} />;
  }
}

export async function getServerSideProps(context) {
  const { owner, project } = context.params;

  try {
    let props;
    if (owner == "github") {
      // special case for special github URL's
      // This is a URL like   https://cocalc.com/github/cocalc,
      // which will end up listing all public repos under the cocalc org (say).
      props = {
        ...(await getPublicPathInfoGithub(`${owner}/${project}`)),
        organization: project,
      };
    } else {
      const project_id = await getProjectId(owner, project);
      props = {
        project_id,
        ...(await getProjectInfo(project_id, context.req)),
        ...(await getProject(project_id, [
          "name",
          "title",
          "description",
          "avatar_image_full",
        ])),
      };
    }
    return await withCustomize({ context, props });
  } catch (err) {
    console.log(err);
    return { notFound: true };
  }
}
