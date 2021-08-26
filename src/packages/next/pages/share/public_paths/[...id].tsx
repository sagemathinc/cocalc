/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import PathContents from "components/share/path-contents";
import PathActions from "components/share/path-actions";
import LinkedPath from "components/share/linked-path";
import Loading from "components/share/loading";
import License from "components/share/license";
import ProjectLink from "components/share/project-link";
import getPublicPathInfo from "lib/share/get-public-path-info";
import useCounter from "lib/share/counter";
import { Layout } from "components/share/layout";
import { Customize } from "lib/share/context";
import withCustomize from "lib/share/get-context";

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
  customize,
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
    <Customize value={customize}>
      <Layout>
        <b>Path: </b>
        <LinkedPath
          path={path}
          relativePath={relativePath}
          id={id}
          isDir={contents?.isdir}
        />
        {description && (
          <>
            <br />
            <b>Description:</b> {description}
          </>
        )}
        {counter && (
          <>
            <br />
            <b>Views:</b> {counter}
          </>
        )}
        <br />
        <b>License:</b> <License license={license} />
        <br />
        {compute_image && (
          <>
            <b>Image:</b> {compute_image}
            <br />
          </>
        )}
        <b>Project:</b>{" "}
        <ProjectLink project_id={project_id} title={projectTitle} />
        <br />
        <PathActions
          id={id}
          path={path}
          relativePath={relativePath}
          isDir={contents?.isdir}
          exclude={new Set(["hosted"])}
        />
        <hr />
        {contents != null && (
          <PathContents
            id={id}
            relativePath={relativePath}
            path={path}
            {...contents}
          />
        )}
      </Layout>
    </Customize>
  );
}

export async function getStaticPaths() {
  return { paths: [], fallback: true };
}

export async function getStaticProps(context) {
  const id = context.params.id[0];
  const relativePath = context.params.id.slice(1).join("/");
  try {
    const props = await getPublicPathInfo(id, relativePath);
    return await withCustomize({ props, revalidate: 15 });
  } catch (_err) {
    //console.log(_err);
    return { notFound: true };
  }
}
