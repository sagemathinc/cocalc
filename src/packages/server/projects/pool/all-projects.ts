import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import create from "@cocalc/server/projects/create";
import { maxAge } from "./get-project";

const log = getLogger("server:new-project-pool:app-projects");

// Get the ids of all projects in the pool.
export async function getAllProjects(): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT project_id FROM projects WHERE users IS NULL AND deleted IS NULL and last_edited >= NOW() - INTERVAL '${maxAge}'`
  );
  return rows.map((x) => x.project_id);
}

// Return an array of the id's of projects that were successefully created.
// For the ones that failed just log that they failed but do not throw
// an exception.  Thus this never fails, but may not actually create n projects.
export async function createProjects(n: number): Promise<string[]> {
  const projectPromises: Promise<string>[] = Array.from(
    { length: n },
    () =>
      create({
        noPool: true, // obviously don't use the pool to add projects to the pool!
        title: "New Project",
        description: "",
      }) // create a promise for each project creation
  );

  const results = await Promise.allSettled(projectPromises); // get the results of all promises

  const successfulProjects: string[] = [];

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      successfulProjects.push(result.value); // add to successful projects array
    } else {
      log.warn(`Project creation failed: ${result.reason}`); // log the failure
    }
  });

  return successfulProjects;
}
