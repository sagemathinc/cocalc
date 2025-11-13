/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Page for a project that is owned by a named account
// or organization.

import getPublicPathId from "lib/names/public-path";
import getPublicPathInfo from "lib/share/get-public-path-info";
import withCustomize from "lib/with-customize";
import PublicPath from "components/path/path";

export default PublicPath;

export async function getServerSideProps(context) {
  const { owner, project, public_path } = context.params;
  try {
    const id = await getPublicPathId(owner, project, public_path);
    const props = await getPublicPathInfo({
      id,
      public_path,
      req: context.req,
    });
    return await withCustomize({ context, props });
  } catch (_err) {
    return { notFound: true };
  }
}
