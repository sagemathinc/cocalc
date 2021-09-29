/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import basePath from "lib/base-path";
import getPublicPathInfo from "lib/share/get-public-path-info";
import withCustomize from "lib/with-customize";
import { getPublicPathNames } from "lib/names/public-path";
import PublicPath from "components/path/path";

export default PublicPath;

export async function getServerSideProps(context) {
  const id = context.params.id[0];
  const relativePath = context.params.id.slice(1).join("/");
  try {
    const names = await getPublicPathNames(id);
    console.log("names = ", names);
    if (names != null) {
      // redirect
      const { res } = context;
      res.writeHead(302, {
        location: join(basePath, names.owner, names.project, names.public_path),
      });
      res.end();
      return;
    }
    const props = await getPublicPathInfo(id, relativePath);
    return await withCustomize({ props });
  } catch (_err) {
    console.log(_err);
    return { notFound: true };
  }
}
