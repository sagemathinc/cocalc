// Route given by an account or organization name.

import getOwner from "lib/names/owner";

export default function Owner({ info }) {
  return <pre>{JSON.stringify(info, 0, 2)}</pre>;
}

export async function getServerSideProps(context) {
  const { owner } = context.params;
  try {
    const info = await getOwner(owner);
    return { props: { info } };
  } catch (_err) {
    //console.log(_err);
    return { notFound: true };
  }
}
