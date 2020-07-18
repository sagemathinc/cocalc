/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The update_site_license_usage_log function exported from this file should be called
periodically to make the site_license_usage_log table contain useful information
about how site licenses are being used.

This function is not *automatically* called periodically by all possible ways
of running CoCalc!  Probably (hopefully?) only cocalc.com actually manages or sells
site license, and in kucalc (the backend used by cocalc.com) this function happens
to get called periodically from one of the manage-* services.

It's also enabled in dev mode by the hub so that cc-in-cc hub developemnt is easier.
*/
import { PostgreSQL } from "../types";
import { query } from "../query";

export async function update_site_license_usage_log(
  db: PostgreSQL
): Promise<void> {
  await Promise.all([
    update_site_license_usage_log_running_projects(db),
    update_site_license_usage_log_not_running_projects(db),
  ]);
}

/*
This function ensures that for every running project P using a site license L,
there is exactly one entry (P,L,time,null) in the table site_license_usage_log.
*/
async function update_site_license_usage_log_running_projects(
  db: PostgreSQL
): Promise<void> {
  const dbg = db._dbg("update_site_license_usage_log_running_projects");
  dbg();

  /*
In the comment below I explain how I figured out the two big queries we do below...

This is a reasonably efficient way to get all pairs (project_id, license_id) where
the license is applied and the project is running (and was actually edited in the last week).
The last_edited is a cheat to make this massively faster by not requiring a scan
through all projects (or an index).

Set A:

WITH running_license_info AS (SELECT project_id, (jsonb_each_text(site_license)).* FROM projects WHERE last_edited >= NOW() - INTERVAL '1 day' AND state#>>'{state}'='running')
SELECT project_id, key AS license_id FROM running_license_info WHERE value != '{}';

This query gets all pairs (project_id, license_id) that are currently running
with that license according to the the site_license_usage_log:

Set B:

SELECT project_id, license_id, start FROM site_license_usage_log WHERE stop IS NULL;

We want to sync these two sets by:

 - For each element (project_id, license_id) of set A that is not in set B,
   add a new entry to the site_license_usage_log table of the
   form (project_id, license_id, NOW()).
 - For each element (project_id, license_id, start) of set B that is not in set A,
   modify that element to be of the form
        (project_id, license_id, start, NOW())
   thus removing it from set B.

What can be done with SQL to accomplish this?

This query computes set A minus set B:

WITH running_license_info AS (SELECT project_id, (jsonb_each_text(site_license)).* FROM projects WHERE last_edited >= NOW() - INTERVAL '1 day' AND state#>>'{state}'='running')
SELECT running_license_info.project_id AS project_id, running_license_info.key::UUID AS license_id FROM running_license_info WHERE
running_license_info.value != '{}' AND NOT EXISTS (SELECT FROM site_license_usage_log WHERE site_license_usage_log.stop IS NULL AND site_license_usage_log.project_id=running_license_info.project_id  AND site_license_usage_log.license_id=running_license_info.key::UUID);

So this query adds everything to site_license_usage_log that is missing:


WITH missing AS (WITH running_license_info AS (SELECT project_id, (jsonb_each_text(site_license)).* FROM projects WHERE last_edited >= NOW() - INTERVAL '1 day' AND state#>>'{state}'='running')
SELECT running_license_info.project_id AS project_id, running_license_info.key::UUID AS license_id FROM running_license_info WHERE
running_license_info.value != '{}' AND
NOT EXISTS (SELECT FROM site_license_usage_log WHERE site_license_usage_log.stop IS NULL AND site_license_usage_log.project_id=running_license_info.project_id  AND site_license_usage_log.license_id=running_license_info.key::UUID))
INSERT INTO site_license_usage_log(project_id, license_id, start) SELECT project_id, license_id, NOW() FROM missing;


In the other direction, we need to fill out everything in set B that is missing from set A:

This query computes set B minus set A:

WITH running_license_info
    AS (SELECT project_id, (jsonb_each_text(site_license)).*
        FROM projects WHERE
            last_edited >= NOW() - INTERVAL '1 day' AND state#>>'{state}'='running'
       )
SELECT site_license_usage_log.license_id AS license_id, site_license_usage_log.project_id AS project_id, site_license_usage_log.start AS start
FROM site_license_usage_log WHERE
stop IS NULL AND
NOT EXISTS
(SELECT FROM running_license_info
 WHERE running_license_info.value != '{}'
 AND running_license_info.project_id=site_license_usage_log.project_id
 AND site_license_usage_log.license_id=running_license_info.key::UUID)


And now modify the entries of site_license_usage_log using set B minus set A:


WITH stopped AS (
WITH running_license_info
    AS (SELECT project_id, (jsonb_each_text(site_license)).*
        FROM projects WHERE
            last_edited >= NOW() - INTERVAL '1 day' AND state#>>'{state}'='running'
       )
SELECT site_license_usage_log.license_id AS license_id, site_license_usage_log.project_id AS project_id, site_license_usage_log.start AS start
FROM site_license_usage_log WHERE
stop IS NULL AND
NOT EXISTS
(SELECT FROM running_license_info
 WHERE running_license_info.value != '{}'
 AND running_license_info.project_id=site_license_usage_log.project_id
 AND site_license_usage_log.license_id=running_license_info.key::UUID)
)
UPDATE site_license_usage_log SET stop=NOW()
FROM stopped
WHERE site_license_usage_log.license_id=stopped.license_id AND
      site_license_usage_log.project_id=stopped.project_id AND
      site_license_usage_log.start = stopped.start;

*/

  const q = `
WITH missing AS
(
   WITH running_license_info AS
   (
      SELECT
         project_id,
         (
            jsonb_each_text(site_license)
         )
         .*
      FROM
         projects
      WHERE
         state #>> '{state}' = 'running'
   )
   SELECT
      running_license_info.project_id AS project_id,
      running_license_info.key::UUID AS license_id
   FROM
      running_license_info
   WHERE
      running_license_info.value != '{}'
      AND NOT EXISTS
      (
         SELECT
         FROM
            site_license_usage_log
         WHERE
            site_license_usage_log.stop IS NULL
            AND site_license_usage_log.project_id = running_license_info.project_id
            AND site_license_usage_log.license_id = running_license_info.key::UUID
      )
)
INSERT INTO
   site_license_usage_log(project_id, license_id, start)
   SELECT
      project_id,
      license_id,
      NOW()
   FROM
      missing;

`;
  await query({ db, query: q });
}

/*
This function ensures that there are no entries of the form
(P,L,time,null) in the site_license_usage_log table with
the project P NOT running.  It does this by replacing the null
value in all such cases by NOW().
*/
async function update_site_license_usage_log_not_running_projects(
  db: PostgreSQL
): Promise<void> {
  const dbg = db._dbg("update_site_license_usage_log_not_running_projects");
  dbg();
  const q = `
WITH stopped AS
(
   WITH running_license_info AS
   (
      SELECT
         project_id,
         (
            jsonb_each_text(site_license)
         )
         .*
      FROM
         projects
      WHERE
         state #>> '{state}' = 'running'
   )
   SELECT
      site_license_usage_log.license_id AS license_id,
      site_license_usage_log.project_id AS project_id,
      site_license_usage_log.start AS start
   FROM
      site_license_usage_log
   WHERE
      stop IS NULL
      AND NOT EXISTS
      (
         SELECT
         FROM
            running_license_info
         WHERE
            running_license_info.value != '{}'
            AND running_license_info.project_id = site_license_usage_log.project_id
            AND site_license_usage_log.license_id = running_license_info.key::UUID
      )
)
UPDATE
   site_license_usage_log
SET
   stop = NOW()
FROM
   stopped
WHERE
   site_license_usage_log.license_id = stopped.license_id
   AND site_license_usage_log.project_id = stopped.project_id
   AND site_license_usage_log.start = stopped.start;
`;
  await query({ db, query: q });
}

/* Answer questions about active usage of a site license by projects */

// An interval of time.
export interface Interval {
  begin: Date;
  end: Date;
}

// Return the number of distinct projects that used the license during the given
// interval of time.
export async function number_of_projects_that_used_license(
  db: PostgreSQL,
  license_id: string,
  interval: Interval
): Promise<number> {
  const dbg = db._dbg(
    `number_of_projects_that_used_license("${license_id}",${interval.begin},${interval.end})`
  );
  dbg();
  return -1;
}

// Return the total number of hours of usage of the given license by projects during
// the given interval of time.
export async function number_of_hours_projects_used_license(
  db: PostgreSQL,

  license_id: string,
  interval: Interval
): Promise<number> {
  const dbg = db._dbg(
    `number_of_hours_projects_used_license("${license_id}",${interval.begin},${interval.end})`
  );
  dbg();
  return -1;
}

// Given a license_id and an interval of time [begin, end], returns
// all projects that used the license during an interval that overlaps with [begin, end].
// Projects are returned as a list of objects:
//     {project_id, [any other fields from the projects table (e.g., title)]}
export async function projects_that_used_license(
  db: PostgreSQL,
  license_id: string,
  interval: Interval,
  fields: string[] = ["project_id"],
  limit: number = 500 // at most this many results; results are ordered by project_id.
): Promise<object[]> {
  const dbg = db._dbg(
    `projects_that_used_license("${license_id}",${interval.begin},${interval.end})`
  );
  dbg([fields, limit]);
  return [];

  /*
  After restricting to a given license, the site_license_usage_log table gives us a set of triples
      (project_id, start, stop)
  where stop may be null in case the project is still running.


               [begin ----------------------- end]

  [start ------------- stop]
  [start --------------------------------------------- stop]
                   [start ----------- stop]
                                [start ----------------stop]

  One of these triples overlaps with the interval from begin to end if:

      - start <= begin and begin <= stop, i.e. begin is in ther interval [start, stop]
      - begin = start and start <= end  , i.e. starts is in the interval [begin, end]

  */
}
