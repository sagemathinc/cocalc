/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Page for a project that is owned by a named account
// or organization.

import { join } from "path";
import getPublicPathInfo from "lib/share/get-public-path-info";
import withCustomize from "lib/with-customize";
import PublicPath from "components/path/path";
import getPublicPathId from "lib/names/public-path";
import getPublicPathInfoGithub from "lib/share/github/get-public-path-info";
import getPublicPathInfoUrl from "lib/share/github/get-public-path-info-url";
import getPublicPathInfoGist from "lib/share/github/get-public-path-info-gist";

export default PublicPath;

export async function getServerSideProps(context) {
  const { owner, project, public_path } = context.params;
  try {
    const props = await getProps(owner, project, public_path, context);
    return await withCustomize({ context, props });
  } catch (_err) {
    console.log(_err);
    return { notFound: true };
  }
}

async function getProps(
  owner: string,
  project: string,
  public_path: string[],
  context
) {
  if (owner == "url") {
    // E.g., https://cocalc.com/url/archive.org/download/musing_math/Volume_Solutions_To_Snub_Dodecahedron.ipynb
    return await getPublicPathInfoUrl(
      `https://${join(project, ...public_path)}`,
      context.req
    );
  }
  if (owner == "gist") {
    // E.g., https://cocalc.com/gist/tylere/77eb0ac86f40006bf0016cacd276b93a
    return await getPublicPathInfoGist(project, public_path[0], context.req);
  }

  const public_path_id = await getPublicPathId(owner, project, public_path[0]);

  if (owner == "github") {
    return await getPublicPathInfoGithub(
      public_path_id,
      project,
      public_path[0],
      public_path.slice(1),
      context.req
    );
  }

  let relativePath = "";
  if (public_path[1] == "files") {
    // only files/ implemented right now; we will add other things like edit/ later.
    relativePath = public_path.slice(2).join("/");
  }
  return await getPublicPathInfo(public_path_id, relativePath, context.req);
}
