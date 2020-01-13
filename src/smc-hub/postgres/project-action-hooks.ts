import { PostgreSQL } from "./types";
const { query } = require("./query");

export async function project_action_request_pre_hook(
  db: PostgreSQL,
  action: string,
  project_id: string,
  dbg: Function
): Promise<void> {
  if (action != "start" && action != "restart") {
    dbg(
      "project_action_request_pre_hook -- only do something on start/restart"
    );
    // We only do something in case of the start or restart action.
    return;
  }
  dbg("project_action_request_pre_hook -- checking for site license");

  // Check for site licenses, then set the site_license field for this project.

  /*
  The only site license rule right now is that *any* project associated to a course with a
  student whose email address contains ucla.edu gets automatically upgraded.  This is
  a temporary one-off site license that will be redone once we have experience with it.
  */

  const project = await query({
    db,
    select: ["course", "site_license"],
    table: "projects",
    where: { project_id },
    one: true
  });
  dbg(`project_action_request_pre_hook -- project=${JSON.stringify(project)}`);

  const gets_site_license: boolean =
    project.course != null &&
    project.course.email_address != null &&
    project.course.email_address.toLowerCase().indexOf("ucla.edu") != -1;

  dbg(
    `project_action_request_pre_hook -- gets_site_license=${gets_site_license}`
  );
  if (!gets_site_license) {
    if (project.site_license != null) {
      // unset the field since it is currently set
      await query({
        db,
        query: "UPDATE projects",
        where: { project_id },
        set: { site_license: null }
      });
    }
    return;
  }

  // Now set the site license properly.  The uuid below is made up, but will correspond to UCLA's site license,
  // once there is a notion of site license in the database.
  const site_license = {
    "d6d2abf3-ced7-45a1-b578-8c2fc2cf1870": { network: 1, member_host: 1 }
  };
  dbg(
    "project_action_request_pre_hook -- setup site license=${JSON.stringify(site_license)}"
  );
  await query({
    db,
    query: "UPDATE projects",
    where: { project_id },
    jsonb_set: { site_license }
  });
}
