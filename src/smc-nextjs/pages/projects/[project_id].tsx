/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Page for a given user.
*/

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Show all the public paths in a given project, and maybe other information about the project? */

import getPool from "lib/database";
import { isUUID } from "lib/util";
import getCollaborators from "lib/get-collaborators";
import { getProjectTitle } from "lib/get-project";
import getPublicPaths from "lib/get-public-paths";
import PublicPaths from "components/public-paths";
import Collaborators from "components/collaborators";
import Loading from "components/loading";

export default function Project({ publicPaths, collaborators, projectTitle }) {
  if (publicPaths == null || collaborators == null || projectTitle == null) {
    return <Loading />;
  }
  return (
    <div>
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
    </div>
  );
}

export async function getStaticPaths() {
  return { paths: [], fallback: true };
}

export async function getStaticProps(context) {
  const { project_id } = context.params;
  if (!isUUID(project_id)) {
    return { notFound: true };
  }

  const pool = getPool();
  let projectTitle;
  try {
    projectTitle = await getProjectTitle(project_id);
  } catch (err) {
    console.warn(err);
    return { notFound: true };
  }

  // Note: unlisted --> makes them not have any page...
  const {
    rows,
  } = await pool.query(
    "SELECT id, path, description, EXTRACT(EPOCH FROM last_edited)*1000 as last_edited FROM public_paths WHERE disabled IS NOT TRUE AND unlisted IS NOT TRUE AND project_id=$1 ORDER BY counter DESC",
    [project_id]
  );
  let publicPaths;
  try {
    publicPaths = await getPublicPaths(project_id);
  } catch (_err) {
    return { notFound: true };
  }

  let collaborators;
  try {
    collaborators = await getCollaborators(project_id);
  } catch (_err) {
    return { notFound: true };
  }

  return {
    props: { projectTitle, publicPaths, collaborators },
    revalidate: 30,
  };
}
