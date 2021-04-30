/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import Link from "next/link";
import getPool from "lib/database";
import { useEffect } from "react";
import { useRouter } from "next/router";
import getContents from "lib/get-contents";
import PathContents from "components/path-contents";
import LinkedPath from "components/linked-path";
import Loading from "components/loading";
import License from "components/license";
import ProjectLink from "components/project-link";
import { getProjectTitle } from "lib/get-project";
import rawURL from "lib/raw-url";
import downloadURL from "lib/download-url";

const basePath = require("lib/basePath")();

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

export default function PublicPath({
  id,
  path,
  project_id,
  projectTitle,
  relativePath,
  description,
  counter,
  compute_image,
  license,
  contents,
  error,
  basePath,
}) {
  useCounter(id);
  if (id == null) return <Loading />;
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
      <a>Edit a copy</a>,{" "}
      {contents != null && (
        <PathContents
          id={id}
          relativePath={relativePath}
          basePath={basePath}
          path={path}
          {...contents}
        />
      )}
    </div>
  );
}

export async function getStaticPaths() {
  // TODO: take into account PRERENDER_COUNT?  (not in dev mode)
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
    "SELECT project_id, path, description, counter, compute_image, license FROM public_paths WHERE disabled IS NOT TRUE AND unlisted IS NOT TRUE AND vhost IS NULL AND id=$1",
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
  let projectTitle;
  try {
    projectTitle = await getProjectTitle(rows[0].project_id);
  } catch (err) {
    console.warn(err);
    // project is gone/deleted...
    return { notFound: true };
  }

  return {
    props: { id, ...rows[0], contents, relativePath, projectTitle, basePath },
    revalidate: 5,
  };
}
