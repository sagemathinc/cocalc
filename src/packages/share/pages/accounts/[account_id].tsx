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

import getPool from "lib/database";
import { isUUID, trunc } from "lib/util";

export default function Account({ first_name, last_name }) {
  return (
    <div>
      <h1>Account</h1>
      Name: {trunc(`${first_name} ${last_name}`, 150)}
    </div>
  );
}

export async function getStaticPaths() {
  return { paths: [], fallback: true };
}

export async function getStaticProps(context) {
  const pool = getPool();

  // Get the sha1 id.
  const { account_id } = context.params;
  if (!isUUID(account_id)) {
    return { notFound: true };
  }

  // Get the database entry
  const {
    rows,
  } = await pool.query(
    "SELECT first_name, last_name FROM accounts WHERE unlisted IS NOT TRUE AND account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    return { notFound: true };
  }
  return {
    props: { account_id, ...rows[0] },
    revalidate: 30,
  };
}
