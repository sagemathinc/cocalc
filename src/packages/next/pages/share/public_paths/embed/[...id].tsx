/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "antd";
import Link from "next/link";
import PathContents from "components/share/path-contents";
import PathActions from "components/share/path-actions";
import Loading from "components/share/loading";
import getPublicPathInfo from "lib/share/get-public-path-info";
import useCounter from "lib/share/counter";
import { Embed } from "components/share/layout";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/share/customize";
import { getTitle } from "lib/share/util";
import { Customize as CustomizeType } from "@cocalc/database/settings/customize";
import { PathContents as PathContentsInterface } from "lib/share/get-contents";

interface Props {
  id: string;
  project_id: string;
  path: string;
  relativePath: string;
  contents: PathContentsInterface;
  error: string;
  customize: CustomizeType;
}

export default function PublicPath(props: Props) {
  const { id, project_id, path, relativePath, contents, error, customize } =
    props;
  useCounter(id);
  if (id == null) return <Loading style={{ fontSize: "30px" }} />;

  return (
    <Customize value={customize}>
      <Embed title={getTitle({ path, relativePath })}>
        <div
          style={{
            backgroundColor: "white",
            display: "inline-block",
            padding: "0 5px",
            margin: "5px",
            width: "100%",
          }}
        >
          <PathActions
            id={id}
            path={path}
            project_id={project_id}
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
        {error != null && (
          <Alert
            showIcon
            type="error"
            style={{ maxWidth: "700px", margin: "30px auto" }}
            message="Error loading file"
            description={
              <div>
                There was a problem loading "{relativePath}" in{" "}
                <Link href={`/share/public_paths/${id}`}>{path}.</Link>
                <br />
                <br />
                {error}
              </div>
            }
          />
        )}
      </Embed>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const id = context.params.id[0];
  const relativePath = context.params.id.slice(1).join("/");
  try {
    const props = await getPublicPathInfo({
      id,
      relativePath,
      req: context.req,
    });
    return await withCustomize({
      context,
      props: { ...props, layout: "embed" },
    });
  } catch (_err) {
    console.log(_err);
    return { notFound: true };
  }
}
