/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool, { timeInSeconds } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

/**
 * Use this on the next/pages/index page – or a simliar one – to get a list of public paths.
 */
export async function getPublicPathsListingCached(isAuthenticated: boolean) {
  const { share_server } = await getServerSettings();
  if (share_server) {
    const pool = getPool("long");
    const { rows } = await pool.query(
      `SELECT id, path, url, description, ${timeInSeconds("last_edited")},
      counter::INT,
       (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=id) AS stars
      FROM public_paths
      WHERE vhost IS NULL AND disabled IS NOT TRUE AND unlisted IS NOT TRUE AND
      ((authenticated IS TRUE AND $1 IS TRUE) OR (authenticated IS NOT TRUE))
      ORDER BY last_edited DESC LIMIT $2`,
      [isAuthenticated, 150],
    );
    return rows;
  } else {
    return null;
  }
}
