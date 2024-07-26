/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import RunApp from "components/app/path";
import A from "components/misc/A";
import ConfigurePublicPath from "components/share/configure-public-path";
import editURL from "lib/share/edit-url";
import shareURL from "lib/share/share-url";
import { join } from "path";

interface Props {
  id: string;
  project_id: string;
  path: string;
  relativePath: string;
}

export default function OpenDirectly(props: Props) {
  const { project_id, path, id, relativePath } = props;
  const url = editURL({
    type: "collaborator",
    project_id,
    path,
    relativePath,
  });
  return (
    <div>
      You are signed in as a collaborator on{" "}
      <A href={editURL({ type: "collaborator", project_id })} external>
        the project
      </A>{" "}
      that contains{" "}
      <A href={url} external>
        this shared document,
      </A>{" "}
      so you can edit it below. Scroll further down to adjust the description
      and license, choose a nice URL, or stop sharing this.
      <RunApp
        start
        project_id={project_id}
        path={join(path, relativePath)}
        style={{
          margin: "30px 0",
        }}
      />
      <hr />
      <br />
      {!relativePath ? (
        <>
          You can adjust how this is shared below, or turn off sharing by
          selecting <em>Private</em>.
          <ConfigurePublicPath id={id} project_id={project_id} path={path} />
        </>
      ) : (
        <>
          <br />
          Go to the{" "}
          <A href={shareURL(id)}>containing directory that was shared</A> to
          configure how this is shared or unshare it.
        </>
      )}
    </div>
  );
}
