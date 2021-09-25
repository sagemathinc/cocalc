/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getOrganizationOrAccountInfo from "lib/org-or-account";

export default function AccountOrOrganization({ info }) {
  return <pre>{JSON.stringify(info, 0, 2)}</pre>;
}

export async function getServerSideProps(context) {
  const { name } = context.params;
  try {
    const info = await getOrganizationOrAccountInfo(name);
    return { props: { info } };
  } catch (_err) {
    //console.log(_err);
    return { notFound: true };
  }
}
