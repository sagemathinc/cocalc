/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import { STARRED } from "@cocalc/util/consts/bookmarks";

const MAX_LENGTH = 2048;

export async function saveStarredFilesBookmarks({
  project_id,
  starred,
}: {
  project_id: string;
  starred: string[];
}) {
  const pool = getPool();

  // test if a row with the given project_id exists in the table projects
  const { rows: project } = await pool.query(
    `SELECT * FROM projects WHERE project_id = $1`,
    [project_id],
  );

  if (project.length === 0) {
    throw new Error(`Project '${project_id} does not exist`);
  }

  // test that all strings in starred are strings and have a maximum length of 2000 characters
  for (const path of starred) {
    if (typeof path !== "string" || path.length > MAX_LENGTH) {
      throw new Error(
        `Invalid starred file path: '${path}' must be a string with a maximum length of 2000 characters`,
      );
    }
  }

  const { rows } = await pool.query(
    `SELECT id FROM bookmarks WHERE project_id=$1 AND type=$2`,
    [project_id, STARRED],
  );

  if (rows.length > 0) {
    await pool.query(
      `UPDATE bookmarks SET payload=$1, last_edited=$2 WHERE id = $3`,
      [starred, Date.now(), rows[0].id],
    );
  } else {
    await pool.query(
      `INSERT INTO bookmarks (type, project_id, payload, last_edited) VALUES ($1, $2, $3, $4)`,
      [STARRED, project_id, starred, Date.now()],
    );
  }
}

export async function loadStarredFilesBookmarks({
  project_id,
}: {
  project_id: string;
}): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT payload FROM bookmarks WHERE project_id=$1 AND type=$2`,
    [project_id, STARRED],
  );

  if (rows.length > 0) {
    return rows[0].payload;
  } else {
    return [];
  }
}
