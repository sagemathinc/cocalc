import Link from "next/link";
import PathContents from "components/share/path-contents";
import PathActions from "components/share/path-actions";
import LinkedPath from "components/share/linked-path";
import Loading from "components/share/loading";
import License from "components/share/license";
import ProjectLink from "components/share/project-link";
import useCounter from "lib/share/counter";
import { Layout } from "components/share/layout";
import { Customize } from "lib/share/customize";
import { getTitle } from "lib/share/util";

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
        <Link href={`/share/public_paths/${id}`}>
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
      <Layout title={getTitle({ path, relativePath })}>
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
