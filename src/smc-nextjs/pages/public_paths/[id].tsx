/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import getPool from "lib/database";
import { useEffect } from "react";
import { useRouter } from "next/router";
import getContents from "lib/get-contents";

// TODO: pre-render the most popuar n pages, according
// to internal db counter.
// const PRERENDER_COUNT = 0;

function useCounter(id: string | undefined) {
  // call API to increment the counter
  const router = useRouter();
  useEffect(() => {
    if (id != null) {
      fetch(`${router.basePath}/api/public_paths/counter/${id}`);
    }
  }, [id]);
}

function PathContents({ isdir, listing, content }) {
  if (isdir) {
    return (
      <pre style={{ border: "1px solid red" }}>
        {JSON.stringify(listing, undefined, 2)}
      </pre>
    );
  }
  return <pre style={{ border: "1px solid red" }}>{content}</pre>;
}

export default function PublicPath({
  id,
  path,
  project_id,
  description,
  counter,
  compute_image,
  contents,
}) {
  useCounter(id);
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
      <Link href={`/projects/${project_id}`}>
        <a>Project</a>
      </Link>
      <br />
      <a>Edit a copy</a>, <a>Download</a>, <a>Raw</a>, <a>Embed</a>
      <hr />
      {contents && <PathContents {...contents} />}
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

  // Get the database entry that describes the public path
  const {
    rows,
  } = await pool.query(
    "SELECT project_id, path, description, counter, compute_image FROM public_paths WHERE disabled IS NOT TRUE AND unlisted IS NOT TRUE AND vhost IS NULL AND id=$1",
    [id]
  );
  if (rows.length == 0 || rows[0].project_id == null || rows[0].path == null) {
    return { notFound: true };
  }

  const contents = await getContents(rows[0].project_id, rows[0].path);

  return {
    props: { id, ...rows[0], contents },
    revalidate: 5,
  };
}
