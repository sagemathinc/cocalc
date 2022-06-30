import getGithubProjectId from "lib/share/github/project";
import getPool from "@cocalc/database/pool";
import * as sha1 from "sha1";
import { join } from "path";

export default async function getGithubPublicPathId(
  githubOrg: string,
  githubRepo: string,
  githubProjectId?: string
): Promise<string> {
  if (!githubProjectId) {
    githubProjectId = await getGithubProjectId();
  }
  const path = join(githubOrg, githubRepo);
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT id FROM public_paths WHERE project_id=$1 AND path=$2",
    [githubProjectId, path]
  );
  if (rows.length > 0) {
    return rows[0].id;
  }
  // Create the public_paths entry:
  // TODO -- should we check that this is a valid github url?  If so, what's the fastest way to do so?
  const id = sha1(githubProjectId + path);
  await pool.query(
    "INSERT INTO public_paths (id, project_id, path, last_edited, last_saved, created, description) VALUES($1, $2, $3, NOW(), NOW(), NOW(), $4)",
    [
      id,
      githubProjectId,
      path,
      `GitHub repository https://github.com/${githubOrg}/${githubRepo}`,
    ]
  );
  return id;
}
