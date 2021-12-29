/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import editURL from "lib/share/edit-url";
import shareURL from "lib/share/share-url";
import A from "components/misc/A";
import ConfigurePublicPath from "components/share/configure-public-path";

export default function OpenDirectly({
  project_id,
  path,
  id,
  relativePath,
}: {
  id: string;
  project_id: string;
  path: string;
  relativePath: string;
}) {
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
      so you can easily{" "}
      <A href={url} external>
        open it directly.
      </A>
      <br />
      {!relativePath ? (
        <>
          <br />
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
