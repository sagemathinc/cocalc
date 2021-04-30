/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const { join, resolve } = require("path");
const getPool = require("./database");

const PROJECTS = process.env.COCALC_PROJECT_PATH
  ? process.env.COCALC_PROJECT_PATH
  : join(
      process.env.SALVUS_ROOT
        ? process.env.SALVUS_ROOT
        : resolve(__dirname + "../.."),
      "data",
      "projects"
    );

// Given a project_id/path, return the directory on the file system where
// that path should be located.
function pathToFiles(project_id, path) {
  return join(PROJECTS, project_id, path);
}
module.exports.pathToFiles = pathToFiles;

module.exports = pathToFiles;

module.exports.pathFromID = async (id) => {
  // todo: [ ] check that id is of a public_path that is enabled
  const pool = getPool();
  const {
    rows,
  } = await pool.query(
    "SELECT project_id, path FROM public_paths WHERE id=$1",
    [id]
  );
  if (rows.length == 0) {
    throw Error(`no such public path: ${id}`);
  }

  return pathToFiles(rows[0].project_id, rows[0].path);
};
