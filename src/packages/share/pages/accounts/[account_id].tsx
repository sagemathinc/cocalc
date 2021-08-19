/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Page for a given user.
*/

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { trunc } from "lib/util";
import getAccountInfo, { AccountInfo } from "lib/get-account-info";
import Loading from "components/loading";
import PublicPaths from "components/public-paths";

export default function Account({
  firstName,
  lastName,
  publicPaths,
}: AccountInfo) {
  if (firstName == null || lastName == null || publicPaths == null) {
    return <Loading />;
  }
  const name = trunc(`${firstName} ${lastName}`, 150);
  return (
    <div>
      <h1>{name}</h1>
      {name} is a collaborator on projects that contain the following public
      documents:
      <br />
      <br />
      <PublicPaths publicPaths={publicPaths} />
    </div>
  );
}

export async function getStaticPaths() {
  return { paths: [], fallback: true };
}

export async function getStaticProps(context) {
  const { account_id } = context.params;
  try {
    const accountInfo = await getAccountInfo(account_id);
    return {
      props: accountInfo,
      revalidate: 30,
    };
  } catch (err) {
    return { notFound: true };
  }
}
