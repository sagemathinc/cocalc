// Page for a project that is owned by a named account
// or organization.

import getPublicPathInfo from "lib/share/get-public-path-info";
import withCustomize from "lib/with-customize";
import PublicPath from "components/path/path";
import getPublicPathId from "lib/names/public-path";

export default PublicPath;

export async function getServerSideProps(context) {
  const { owner, project, public_path } = context.params;
  try {
    const public_path_id = await getPublicPathId(
      owner,
      project,
      public_path[0]
    );
    const relativePath = public_path.slice(1).join("/");
    const props = await getPublicPathInfo(public_path_id, relativePath);
    return await withCustomize({ props });
  } catch (_err) {
    // console.log(_err);
    return { notFound: true };
  }
}
