/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import {
  MAX_LENGTH_STAR,
  MAX_STARS,
  STARRED_FILES,
} from "@cocalc/util/consts/bookmarks";
import getLogger from "@cocalc/backend/logger";

const L = getLogger("server:bookmarks");

export type SaveStarredFilesBoookmarksProps = {
  project_id: string;
  account_id: string;
  stars: string[];
  mode: "set" | "add" | "remove";
};

export async function saveStarredFilesBookmarks({
  project_id,
  account_id,
  stars,
  mode,
}: SaveStarredFilesBoookmarksProps): Promise<string[]> {
  if (account_id === project_id) {
    throw new Error(
      `As of now, you cannot use a project-level API key to modify account specific bookmarks. Use the account level API key!`,
    );
  }

  const pool = getPool();

  // test if a row with the given project_id exists in the table projects
  const { rows: project } = await pool.query(
    `SELECT * FROM projects WHERE project_id = $1`,
    [project_id],
  );

  if (project.length === 0) {
    throw new Error(`Project '${project_id} does not exist`);
  }

  if (!Array.isArray(stars)) {
    throw new Error(
      `Invalid stars value: type='${typeof stars}'. Must be an array of strings.`,
    );
  }

  if (stars.length > MAX_STARS) {
    L.warn(
      `Too many stars: '${stars.length}'. Truncating to ${MAX_STARS} items.`,
    );
    stars = stars.slice(0, MAX_STARS);
  }

  // test that all strings in starred are strings and have a maximum length of $MAX_LENGTH characters
  for (const star of stars) {
    if (typeof star !== "string" || star.length > MAX_LENGTH_STAR) {
      throw new Error(
        `Invalid star: '${star}' must be a string with a maximum length of ${MAX_LENGTH_STAR} characters`,
      );
    }
  }

  // in-place sort. neat to keep them in a canonical ordering.
  stars.sort();

  const { rows } = await pool.query(
    `SELECT id FROM bookmarks WHERE project_id=$1 AND type=$2 AND account_id=$3`,
    [project_id, STARRED_FILES, account_id],
  );

  const query = async (q, v): Promise<string[]> => {
    const { rows } = await pool.query<{ stars: string[] }>(q, v);
    return rows[0].stars;
  };

  if (rows.length > 0) {
    switch (mode) {
      case "add": {
        // Add the new stars items to the list
        return query(
          `UPDATE bookmarks
          SET stars = ARRAY_CAT(stars, $1::TEXT[]),
              last_edited=$2
          WHERE id = $3 AND account_id = $4 AND type=$5
          RETURNING stars;`,
          [stars, new Date(), rows[0].id, account_id, STARRED_FILES],
        );
      }
      case "remove": {
        // Remove any stars that may exist
        return query(
          `UPDATE bookmarks
          SET stars = (
                SELECT ARRAY_AGG(elem)
                FROM UNNEST(stars) AS elem
                WHERE NOT elem = ANY($1::TEXT[])
              ),
              last_edited=$2
          WHERE id = $3 AND account_id=$4 AND type=$5
          RETURNING stars;`,
          [stars, new Date(), rows[0].id, account_id, STARRED_FILES],
        );
      }
      case "set": {
        // Instead of appending the new stars, we replace them with a set operation
        return query(
          `UPDATE bookmarks
          SET stars=$1::TEXT[],
              last_edited=$2
          WHERE id = $3 AND account_id=$4 AND type=$5
          RETURNING stars`,
          [stars, new Date(), rows[0].id, account_id, STARRED_FILES],
        );
      }
    }
  } else {
    return query(
      `INSERT INTO bookmarks (type, project_id, stars, account_id, last_edited)
       VALUES ($1, $2, $3::TEXT[], $4, $5) RETURNING stars`,
      [STARRED_FILES, project_id, stars, account_id, new Date()],
    );
  }
}

export type LoadStarredFilesBookmarksProps = {
  project_id: string;
  account_id: string;
};

export async function loadStarredFilesBookmarks({
  project_id,
  account_id,
}: LoadStarredFilesBookmarksProps): Promise<{
  stars: string[];
  last_edited?: number;
}> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT stars, last_edited FROM bookmarks WHERE project_id=$1 AND type=$2 AND account_id=$3`,
    [project_id, STARRED_FILES, account_id],
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      stars: row.stars ?? [],
      last_edited: row.last_edited?.getTime(),
    };
  } else {
    return { stars: [] };
  }
}
