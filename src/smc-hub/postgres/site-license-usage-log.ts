import { PostgreSQL } from "./types";

export async function update_site_license_usage_log(
  db: PostgreSQL
): Promise<void> {
  await update_site_license_usage_log_running_projects(db);
  await update_site_license_usage_log_not_running_projects(db);
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

  // There is definitely a way to do this that is super clever and all one db query, right?



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
}
