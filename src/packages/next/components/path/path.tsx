import { Divider } from "antd";
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
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import { Icon } from "@cocalc/frontend/components/icon";

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
  disabled,
  unlisted,
}) {
  useCounter(id);
  if (id == null) return <Loading style={{ fontSize: "30px" }} />;
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
        <br />
        {description?.trim() && (
          <>
            <b>Description:</b> <SanitizedMarkdown value={description} />
          </>
        )}
        {counter && (
          <>
            <b>Views:</b> {counter}
            <br />
          </>
        )}
        <b>License:</b> <License license={license} />
        <br />
        {(unlisted || disabled) && (
          <div>
            <b>Visibility:</b>{" "}
            {disabled ? (
              <>
                {" "}
                <Icon name="lock" /> Private (only visible to collaborators on
                the project)
              </>
            ) : unlisted ? (
              <>
                <Icon name="eye-slash" /> Unlisted (only visible to those who
                know the link)
              </>
            ) : (
              ""
            )}
          </div>
        )}
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
          project_id={project_id}
          image={compute_image}
          description={description}
        />
        <Divider />
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
