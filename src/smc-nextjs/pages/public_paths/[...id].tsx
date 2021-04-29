/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import getPool from "lib/database";
import { useEffect } from "react";
import { useRouter } from "next/router";
import getContents from "lib/get-contents";
import DirectoryListing from "components/directory-listing";
import { join } from "path";

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

function PathContents({ id, isdir, listing, content }) {
  if (isdir) {
    return <DirectoryListing id={id} listing={listing} />;
  }
  return <pre style={{ border: "1px solid red" }}>{content}</pre>;
}

export default function PublicPath({
  id,
  path,
  project_id,
  relativePath,
  description,
  counter,
  compute_image,
  contents,
  error,
}) {
  useCounter(id);
  if (id == null) return <span>Loading...</span>;
  if (error != null) {
    return (
      <div>
        There was a problem loading "{relativePath}" in{" "}
        <Link href={`/public_paths/${id}`}>
          <a>{path}.</a>
        </Link>
        <br />
        <br />
        {error}
      </div>
    );
  }
  return (
    <div>
      <b>Public {contents?.isdir ? "directory" : "file"}:</b> {path}
      {relativePath ? <i>/{relativePath}</i> : ""}
      <br />
      <b>Description:</b> {description}
      <br />
      <b>Views:</b> {counter}
      <br />
      <b>Compute image:</b> {compute_image}
      <br />
      <Link href={`/projects/${project_id}`}>
        <a>Project</a>
      </Link>
      <br />
      <a>Edit a copy</a>, <a>Download</a>, <a>Raw</a>, <a>Embed</a>
      <hr />
      {contents != null && <PathContents id={id} {...contents} />}
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
  const id = context.params.id[0];
  const relativePath = context.params.id.slice(1).join("/");
  if (
    typeof id != "string" ||
    id.length != 40 ||
    relativePath.indexOf("..") != -1 ||
    relativePath[0] == "/"
  ) {
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

  let contents;
  try {
    contents = await getContents(
      rows[0].project_id,
      join(rows[0].path, relativePath)
    );
  } catch (error) {
    return {
      props: { id, ...rows[0], relativePath, error: error.toString() },
      revalidate: 5,
    };
  }

  return {
    props: { id, ...rows[0], contents, relativePath },
    revalidate: 5,
  };
}
