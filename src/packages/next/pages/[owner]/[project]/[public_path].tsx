// Page for a project that is owned by a named account
// or organization.

import getPublicPathId from "lib/names/public-path";

export default function PublicPath({ info }) {
  return <pre>{JSON.stringify(info, 0, 2)}</pre>;
}

export async function getServerSideProps(context) {
  const { owner, project, public_path } = context.params;
  try {
    const info = await getPublicPathId(owner, project, public_path);
    return { props: { info } };
  } catch (_err) {
    // console.log(_err);
    return { notFound: true };
  }
}
