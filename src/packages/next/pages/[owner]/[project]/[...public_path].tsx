/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Page for a project that is owned by a named account
// or organization.

import getPublicPathInfo from "lib/share/get-public-path-info";
import withCustomize from "lib/with-customize";
import PublicPath from "components/path/path";
import getPublicPathId from "lib/names/public-path";
import getPublicPathInfoGithub from "lib/share/github/get-public-path-info";

export default PublicPath;

export async function getServerSideProps(context) {
  const { owner, project, public_path } = context.params;
  try {
    const public_path_id = await getPublicPathId(
      owner,
      project,
      public_path[0]
    );
    let props;
    if (owner == "github") {
      props = await getPublicPathInfoGithub(
        public_path_id,
        project,
        public_path[0],
        public_path.slice(1),
        context.req
      );
    } else {
      let relativePath = "";
      if (public_path[1] == "files") {
        // only files/ implemented right now; we will add other things like edit/ later.
        relativePath = public_path.slice(2).join("/");
      }
      props = await getPublicPathInfo(
        public_path_id,
        relativePath,
        context.req
      );
    }
    return await withCustomize({ context, props });
  } catch (_err) {
    console.log(_err);
    return { notFound: true };
  }
}
