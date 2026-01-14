/*
Set the course info about a student project.

This is the course field in the projects table.

For security reasons, this function does a lot more than
just set the course field as requested:

- If the account_id requesting the change is not a collaborator on
course.project_id, for the current value of the course field, then
the request is rejected.   This is because the teacher and TA's
are the collaborators on course.project_id, and only they should
be able to change the course field.

- If the payInfo field is different than the current course.payInfo
field (ignoring the cost fields for comparison), then we compute
and fill in the cost.  This is used to lock in the purchase price
when the instructor decides on what license the students should buy.
It would be unfair to increase their price.

- If course.paid field is set currently in the database, then it is
always maintained, rather than just being deleted.
*/

import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getPool, { PoolClient } from "@cocalc/database/pool";
import { isEqual } from "lodash";
import type { CourseInfo } from "@cocalc/util/db-schema/projects";
import { compute_cost } from "@cocalc/util/purchases/quota/compute-cost";

interface Options {
  account_id: string; // who is setting the course field
  project_id: string; // the project id of the student project
  course: CourseInfo; // what it is being set to
  noCheck?: boolean; // if set to true, don't check permissions for account_id.  This is for internal use and not accessible via the api.
  client?: PoolClient;
}
export default async function setCourseInfo({
  account_id,
  project_id,
  course,
  noCheck,
  client,
}: Options): Promise<{ course: CourseInfo }> {
  if (!noCheck && !(await isCollaborator({ account_id, project_id }))) {
    throw Error(
      "you must be a collaborator on the the project to set the course info"
    );
  }
  if (typeof course != "object") {
    // just in case
    throw Error("course must be an object of type CourseInfo");
  }
  const pool = client ?? getPool();

  // get current value of course:
  const { rows } = await pool.query(
    "SELECT course FROM projects WHERE project_id=$1",
    [project_id]
  );
  if (rows.length == 0) {
    // shouldn't happen due to isCollaborator check above
    throw Error("no such project");
  }
  const currentCourse: CourseInfo | undefined = rows[0].course;
  if (!noCheck && currentCourse?.project_id != null) {
    // check that account_id is a collab, so allowed to edit course field.
    if (
      !(await isCollaborator({
        account_id,
        project_id: currentCourse?.project_id,
      }))
    ) {
      throw Error(
        "you must be a collaborator on the the project the contains the course (i.e., only TA's and instructors can set the course field)"
      );
    }
  }

  // Maintain paid field
  if (course != null && currentCourse?.paid && !course?.paid) {
    course = { ...course, paid: currentCourse.paid };
  }

  // Compute cost
  if (course?.payInfo != null) {
    const currentPayInfo = currentCourse?.payInfo;
    const payInfo = { ...course.payInfo };
    delete currentPayInfo?.cost;
    delete payInfo.cost;
    if (!isEqual(payInfo, currentPayInfo)) {
      // changed -- so we compute cost
      // important that payInfo has cost deleted so it isn't just used for the cost computation.
      course.payInfo.cost = compute_cost(payInfo);
    }
  }

  await pool.query("UPDATE projects SET course=$1 WHERE project_id=$2", [
    course,
    project_id,
  ]);
  return { course };
}
