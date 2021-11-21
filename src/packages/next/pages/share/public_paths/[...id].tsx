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
    if (names != null) {
      // redirect
      const { res } = context;
      let location = join(
        basePath,
        names.owner,
        names.project,
        names.public_path
      );
      if (context.params.id.length > 1) {
        location = join(
          location,
          "files",
          context.params.id.slice(1).join("/")
        );
      }
      res.writeHead(302, { location });
      res.end();
      return { props: {} };
    }
    const props = await getPublicPathInfo(id, relativePath, context.req);
    return await withCustomize({ context, props });
  } catch (_err) {
    console.log(_err);
    return { notFound: true };
  }
}
