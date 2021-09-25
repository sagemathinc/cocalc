// Page for a project that is owned by a named account
// or organization.

import getProjectId from "lib/names/project";

export default function Project({ info }) {
  return <pre>{JSON.stringify(info, 0, 2)}</pre>;
}

export async function getServerSideProps(context) {
  const { owner, project } = context.params;
  try {
    const info = await getProjectId(owner, project);
    return { props: { info } };
  } catch (_err) {
    // console.log(_err);
    return { notFound: true };
  }
}
