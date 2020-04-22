import { PostgreSQL } from "../types";
import { callback2 } from "../../smc-util/async-utils";
import { copy_with, len } from "../../smc-util/misc2";

export async function number_of_running_projects_using_license(
  db: PostgreSQL,
  license_id: string
): Promise<number> {
  /* Do a query to count the number of projects that:
      (1) are running,
      (2) have the given license_id has a key in their site_license field with
          a nontrivial value.


  select project_id, site_license, state from projects where state#>>'{state}' in ('running', 'starting') and site_license#>>'{f3942ea1-ff3f-4d9f-937a-c5007babc693}'!='{}';
  */

  const query = `SELECT COUNT(*) FROM projects WHERE state#>>'{state}' IN ('running', 'starting') AND site_license#>>'{${license_id}}'!='{}'`;
  const x = await db.async_query({ query });
  return parseInt(x.rows[0].count);
}

/* Returns information about how licenses are being used across ALL running projects
   in the system right now.

   The following query excludes anything with site_license null or {}, due to how sql works:

   select site_license from projects where state#>>'{state}' in ('running', 'starting') and site_license!='{}';

   We then just process the result in Javascript.  It would be possible to make a more complicated query that
   does all the processing in the database, and returns less data as output, but that would be harder for me,
   so I leave that to others or later (since this query is not likely to be used too much).
*/
export async function site_license_usage_stats(
  db: PostgreSQL
): Promise<{ [license_id: string]: number }> {
  const query =
    "select site_license from projects where state#>>'{state}' in ('running', 'starting') and site_license!='{}'";
  const result = await db.async_query({ query });
  const usage: { [license_id: string]: number } = {};
  for (let row of result.rows) {
    for (const license_id in row.site_license) {
      if (len(row.site_license[license_id]) > 0) {
        if (usage[license_id] == null) {
          usage[license_id] = 1;
        } else {
          usage[license_id] += 1;
        }
      }
    }
  }
  return usage;
}

function query_projects_using_site_license(
  license_id: string,
  cutoff?: Date
): { query: string; params: any[] } {
  const params: any[] = [];
  let query: string;
  if (cutoff) {
    query = `FROM projects, site_license_usage_log WHERE  `;
    query += "projects.project_id = site_license_usage_log.project_id AND ";
    query += "site_license_usage_log.license_id = $1 AND";
    query += "(site_license_usage_log.start >= $2 OR ";
    query += " site_license_usage_log.stop >= $2 OR ";
    query += " site_license_usage_log.stop IS NULL)";
    params.push(license_id);
    params.push(cutoff);
  } else {
    // easier -- just directly query the projects table.
    query = `FROM projects`;
    query += ` WHERE state#>>'{state}' IN ('running', 'starting') AND site_license#>>'{${license_id}}'!='{}'`;
  }
  return { query, params };
}

export async function projects_using_site_license(
  db: PostgreSQL,
  opts: {
    license_id: string;
    fields: string[]; // assumed sanitized by caller!
    cutoff?: Date;
    limit?: number;
    truncate?: number;
  }
): Promise<{ [field: string]: any }[]> {
  const query_fields = process_fields(opts.fields, opts.truncate);

  const { query, params } = query_projects_using_site_license(
    opts.license_id,
    opts.cutoff
  );
  const select = `SELECT ${query_fields.join(",")} `;
  const x = await callback2(db._query.bind(db), {
    query: select + " " + query,
    limit: opts.limit,
    params,
  });
  const v: { [field: string]: any }[] = [];
  for (const row of x.rows) {
    v.push(copy_with(row, opts.fields));
  }
  return v;
}

function process_fields(
  fields: string[],
  truncate: number | undefined
): string[] {
  const v: string[] = [];
  for (let field of fields) {
    if (truncate && (field == "title" || field == "description")) {
      field = `left(projects.${field},${truncate}) as ${field}`;
    } else if (field == "project_id") {
      field = `distinct(projects.project_id)`;
    } else {
      field = `projects.${field}`;
    }
    v.push(field);
  }
  return v;
}

export async function number_of_projects_using_site_license(
  db: PostgreSQL,
  opts: {
    license_id: string;
    cutoff?: Date;
  }
): Promise<number> {
  const { query, params } = query_projects_using_site_license(
    opts.license_id,
    opts.cutoff
  );

  const x = await db.async_query({
    query: "SELECT COUNT(DISTINCT(projects.project_id)) " + query,
    params,
  });
  return parseInt(x.rows[0].count);
}
