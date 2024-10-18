/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import { STARRED } from "@cocalc/util/consts/bookmarks";

const MAX_LENGTH = 2048;

export type SaveStarredFilesBoookmarksProps = {
  project_id: string;
  account_id: string;
  payload: string[];
  mode: "set" | "add" | "remove";
};

export async function saveStarredFilesBookmarks({
  project_id,
  account_id,
  payload: stars,
  mode,
}: SaveStarredFilesBoookmarksProps): Promise<string[]> {
  const pool = getPool();

  // test if a row with the given project_id exists in the table projects
  const { rows: project } = await pool.query(
    `SELECT * FROM projects WHERE project_id = $1`,
    [project_id],
  );

  if (project.length === 0) {
    throw new Error(`Project '${project_id} does not exist`);
  }

  // test that all strings in starred are strings and have a maximum length of $MAX_LENGTH characters
  for (const path of stars) {
    if (typeof path !== "string" || path.length > MAX_LENGTH) {
      throw new Error(
        `Invalid starred file path: '${path}' must be a string with a maximum length of ${MAX_LENGTH} characters`,
      );
    }
  }

  // in-place sort. neat to keep them in a canonical ordering.
  stars.sort();

  const { rows } = await pool.query(
    `SELECT id FROM bookmarks WHERE project_id=$1 AND type=$2 AND account_id=$3`,
    [project_id, STARRED, account_id],
  );

  const query = async (q, v): Promise<string[]> => {
    const { rows } = await pool.query<{ payload: string[] }>(q, v);
    return rows[0].payload;
  };

  if (rows.length > 0) {
    switch (mode) {
      case "add": {
        // Add the new starred items to the list
        return query(
          `UPDATE bookmarks
          SET payload = jsonb_set(payload, '{stars}', (payload->'stars') || array_to_json($1::TEXT[])::JSONB),
              last_edited=$2
          WHERE id = $3 AND account_id = $4
          RETURNING payload;`,
          [stars, new Date(), rows[0].id, account_id],
        );
      }
      case "remove": {
        // Remove any stars that may exist
        return query(
          `UPDATE bookmarks
          SET payload = jsonb_set(payload, '{stars}',
                        to_jsonb(array(
                          SELECT jsonb_array_elements_text(payload -> 'stars')
                          EXCEPT SELECT unnest($1::TEXT[])
                        ))),
              last_edited=$2
          WHERE id = $3 AND account_id=$4
          RETURNING payload;`,
          [stars, new Date(), rows[0].id, account_id],
        );
      }
      case "set": {
        // Instead of appending the new stars, we replace them with a set operation
        return query(
          `UPDATE bookmarks SET payload=$1, last_edited=$2 WHERE id = $3 AND account_id=$4 RETURNING payload`,
          [{ stars }, new Date(), rows[0].id, account_id],
        );
      }
    }
  } else {
    return query(
      `INSERT INTO bookmarks (type, project_id, payload, account_id, last_edited)
       VALUES ($1, $2, $3, $4, $5) RETURNING payload`,
      [STARRED, project_id, { stars }, account_id, new Date()],
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
  payload: string[];
  last_edited?: number;
}> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT payload, last_edited FROM bookmarks WHERE project_id=$1 AND type=$2 AND account_id=$3`,
    [project_id, STARRED, account_id],
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      payload: row.payload?.stars ?? [],
      last_edited: row.last_edited?.getTime(),
    };
  } else {
    return { payload: [] };
  }
}
