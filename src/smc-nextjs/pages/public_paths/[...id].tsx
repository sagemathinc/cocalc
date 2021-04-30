/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import ExternalLink from "components/external-link";
import PathContents from "components/path-contents";
import LinkedPath from "components/linked-path";
import Loading from "components/loading";
import License from "components/license";
import ProjectLink from "components/project-link";
import rawURL from "lib/raw-url";
import editURL from "lib/edit-url";
import downloadURL from "lib/download-url";
import getPublicPathInfo from "lib/get-public-path-info";
import useCounter from "lib/counter";

// TODO: pre-render the most popuar n pages, according
// to internal db counter.
// const PRERENDER_COUNT = 0;

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
  appServer,
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
      <b>Public path: </b>
      <LinkedPath
        path={path}
        relativePath={relativePath}
        id={id}
        isdir={contents?.isdir}
      />
      <br />
      <b>Description:</b> {description}
      <br />
      <b>Views:</b> {counter}
      <br />
      <b>License:</b> <License license={license} />
      <br />
      <b>Compute image:</b> {compute_image}
      <br />
      <b>Project:</b>{" "}
      <ProjectLink project_id={project_id} title={projectTitle} />
      <br />
      <ExternalLink
        href={editURL(
          id,
          relativePath ? path + "/" + relativePath : path,
          appServer ?? basePath
        )}
      >
        Edit
      </ExternalLink>
      ,{" "}
      <ExternalLink
        href={rawURL(id, relativePath ? relativePath : path, basePath)}
      >
        Raw
      </ExternalLink>
      ,{" "}
      <Link
        href={`/public_paths/embed/${id}${
          relativePath ? "/" + relativePath : ""
        }`}
      >
        <a>Embed</a>
      </Link>
      {!contents?.isdir && (
        <>
          ,{" "}
          <a
            href={downloadURL(id, relativePath ? relativePath : path, basePath)}
          >
            Download
          </a>
        </>
      )}
      <hr />
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
  const id = context.params.id[0];
  const relativePath = context.params.id.slice(1).join("/");
  try {
    const props = await getPublicPathInfo(id, relativePath);
    if (process.env.COCALC_APP_SERVER != null) {
      props.appServer = process.env.COCALC_APP_SERVER; // used for edit link
    }
    return {
      props,
      revalidate: 5,
    };
  } catch (_err) {
    //console.log(_err);
    return { notFound: true };
  }
}
