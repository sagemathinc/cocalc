/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPublicPathInfo from "lib/share/get-public-path-info";
import withCustomize from "lib/with-customize";
import PublicPath from "components/path/path";

export default PublicPath;

export async function getServerSideProps(context) {
  const id = context.params.id[0];
  const relativePath = context.params.id.slice(1).join("/");
  try {
    const props = await getPublicPathInfo(id, relativePath);
    return await withCustomize({ props });
  } catch (_err) {
    //console.log(_err);
    return { notFound: true };
  }
}
