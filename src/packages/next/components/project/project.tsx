/*
Page for a given project

Show all the public paths in a given project, and maybe other information about the project?
*/

import PublicPaths from "components/share/public-paths";
import Collaborators from "components/share/collaborators";
import Loading from "components/share/loading";
import { Layout } from "components/share/layout";
import A from "components/misc/A";
import { Customize } from "lib/share/customize";
import { User } from "lib/share/types";
import Edit from "./edit";
import editURL from "lib/share/edit-url";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";

export default function Project({
  project_id,
  publicPaths,
  collaborators,
  title,
  description,
  name,
  customize,
}) {
  if (publicPaths == null || collaborators == null || title == null) {
    return <Loading style={{ fontSize: "30px" }} />;
  }

  const collab = isCollaborator(customize.account, collaborators);
  return (
    <Customize value={customize}>
      <Layout title={title}>
        <h1>
          Project:{" "}
          {collab ? (
            <A href={editURL({ project_id, type: "collaborator" })} external>
              {title}
            </A>
          ) : (
            title
          )}
        </h1>
        <div style={{ color: "#666" }}>
          <Markdown value={description} />
        </div>
        {collab && (
          <Edit
            project_id={project_id}
            title={title}
            description={description}
            name={name}
          />
        )}
        {collaborators != null && collaborators.length > 0 && (
          <>
            <h2>Collaborators</h2>
            <Collaborators collaborators={collaborators} />
            <br /> <br />
          </>
        )}
        <h2>Public Paths</h2>
        {publicPaths != null && publicPaths.length == 0 ? (
          <div>No public paths.</div>
        ) : (
          <PublicPaths publicPaths={publicPaths} />
        )}
      </Layout>
    </Customize>
  );
}

function isCollaborator(
  account: undefined | { account_id: string },
  collaborators: User[]
): boolean {
  const account_id = account?.account_id;
  if (account_id == null) return false;
  for (const user of collaborators) {
    if (user.account_id == account_id) return true;
  }
  return false;
}
