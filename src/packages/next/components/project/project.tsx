/*
Page for a given project

Show all the public paths in a given project, and maybe other information about the project?
*/

import PublicPaths from "components/share/public-paths";
import Collaborators from "components/share/collaborators";
import Loading from "components/share/loading";
import { Layout } from "components/share/layout";
import { Customize } from "lib/share/customize";

export default function Project({
  publicPaths,
  collaborators,
  projectTitle,
  customize,
}) {
  if (publicPaths == null || collaborators == null || projectTitle == null) {
    return <Loading />;
  }
  return (
    <Customize value={customize}>
      <Layout title={projectTitle}>
        <h1>Project: {projectTitle}</h1>
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
