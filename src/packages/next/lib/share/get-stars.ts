/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Get the public paths that the signed in user has starred.
*/

import getPool, { timeInSeconds } from "@cocalc/database/pool";
import { PublicPath } from "./types";
import getAccountId from "lib/account/get-account";

export default async function getStars(
  req //  use to get account_id if necessary
): Promise<PublicPath[]> {
  const account_id = await getAccountId(req);
  if (!account_id) return []; // not signed in

  const pool = getPool("short");
  const { rows } = await pool.query(
    `SELECT id, path, url, description, ${timeInSeconds(
      "last_edited"
    )}, disabled, unlisted, authenticated,
    counter::INT,
     (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=id) AS stars
    FROM public_paths, public_path_stars WHERE
    public_path_stars.account_id=$1 AND public_path_stars.public_path_id = public_paths.id ORDER BY public_paths.last_edited DESC`,
    [account_id]
  );
  return rows;
}
