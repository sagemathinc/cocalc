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

/* Show all the public paths in a given project, and maybe other information about the project? */

import getPool from "lib/database";
import { isUUID } from "lib/util";
import PublicPathsTable from "components/public-paths-table";

export default function Project({ rows }) {
  return (
    <div>
      <h1>Project</h1>

      <h2>Public Paths</h2>
      {rows != null && rows.length > 0 ? (
        <PublicPathsTable rows={rows} />
      ) : (
        "No public paths."
      )}
    </div>
  );
}

export async function getStaticPaths() {
  return { paths: [], fallback: true };
}

export async function getStaticProps(context) {
  const pool = getPool();

  const { project_id } = context.params;
  if (!isUUID(project_id)) {
    return { notFound: true };
  }

  // Get the database entry
  // Note: unlisted --> makes them not have any homepage...
  const {
    rows,
  } = await pool.query(
    "SELECT id, path, description, EXTRACT(EPOCH FROM last_edited)*1000 as last_edited  FROM public_paths WHERE disabled IS NOT TRUE AND unlisted IS NOT TRUE AND project_id=$1 ORDER BY counter DESC",
    [project_id]
  );

  return {
    props: { rows },
    revalidate: 30,
  };
}
