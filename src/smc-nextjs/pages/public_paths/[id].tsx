/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "lib/database";
import getCollaborators from "lib/get-collaborators";
import Collaborators from "components/collaborators";

// TODO: pre-render the most popuar n pages, according
// to internal db counter.
// const PRERENDER_COUNT = 0;

export default function PublicPath({
  path,
  description,
  counter,
  compute_image,
  collaborators,
}) {
  return (
    <div>
      Path: {path}
      <br />
      Description: {description}
      <br />
      Views: {counter}
      <br />
      Compute image: {compute_image}
      <br />
      Project collaborators: <Collaborators collaborators={collaborators} />
      <br />
      <a>Edit a copy</a>, <a>Download</a>, <a>Raw</a>, <a>Embed</a>
      <hr />
      <pre>The actual file here or directory listing...</pre>
    </div>
  );
}

export async function getStaticPaths() {
  // TODO: take into account PRERENDER_COUNT
  return { paths: [], fallback: true };
}

export async function getStaticProps(context) {
  const pool = getPool();

  // Get the sha1 id.
  const { id } = context.params;
  if (typeof id != "string" || id.length != 40) {
    return { notFound: true };
  }

  // Get the database entry
  const {
    rows,
  } = await pool.query(
    "SELECT project_id, path, description, counter, compute_image FROM public_paths WHERE disabled IS NOT TRUE AND unlisted IS NOT TRUE AND vhost IS NULL AND id=$1",
    [id]
  );
  if (rows.length == 0) {
    return { notFound: true };
  }
  const collaborators = await getCollaborators(rows[0].project_id);

  return {
    props: { collaborators, id, ...rows[0] },
    revalidate: 5,
  };
}
