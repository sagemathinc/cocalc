/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import PathContents from "components/path-contents";
import PathActions from "components/path-actions";
import Loading from "components/loading";
import getPublicPathInfo from "lib/get-public-path-info";
import useCounter from "lib/counter";

export default function PublicPath({
  id,
  path,
  relativePath,
  contents,
  error,
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
      <div
        style={{
          backgroundColor: "white",
          display: "inline-block",
          padding: "0 5px",
          margin: "5px",
        }}
      >
        <PathActions
          id={id}
          path={path}
          relativePath={relativePath}
          isDir={!!contents?.isdir}
          exclude={new Set(["embed"])}
        />
      </div>
      {contents != null && (
        <PathContents
          id={id}
          relativePath={relativePath}
          path={path}
          {...contents}
        />
      )}
    </div>
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
    return {
      props: { ...props, layout: "embed" },
      revalidate: 5,
    };
  } catch (_err) {
    console.log(_err);
    return { notFound: true };
  }
}
