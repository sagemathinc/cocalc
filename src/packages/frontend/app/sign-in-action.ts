/*
Do something somewhat friendly when a user signs in for the first time,
either after creating an account or being signed out.

For now:

- ensure they are a collab on at least one project
- open the most recent project they actively used and show the +New page

That's it for now.
*/

import { delay } from "awaiting";
import { redux } from "@cocalc/frontend/app-framework";
import { once } from "@cocalc/util/async-utils";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { cmp } from "@cocalc/util/misc";
import { QueryParams } from "@cocalc/frontend/misc/query-params";

export default async function signInAction() {
  const signIn = QueryParams.get("sign-in");
  if (signIn == null) {
    return;
  }
  QueryParams.remove("sign-in");
  await delay(1); // so projects store is created (not in sync initial load loop)
  const project_id = await getProject();
  const actions = redux.getActions("projects");
  actions.open_project({ project_id, switch_to: true, target: "new" });
  await actions.start_project(project_id);
}

async function create(title = "My First Project") {
  const project_id = await webapp_client.project_client.create({
    title,
    description: "",
  });
  const projects = redux.getStore("projects");
  // wait until projects_map is loaded, so we know what projects the users has (probably)
  while (projects.getIn(["project_map", project_id]) == null) {
    await once(projects, "change");
  }
  return project_id;
}

async function getProject(): Promise<string> {
  const projects = redux.getStore("projects");
  // wait until projects_map is loaded, so we know what projects the users has (probably)
  while (projects.get("project_map") == null) {
    await once(projects, "change");
  }
  const account = redux.getStore("account");
  while (account.get("created") == null) {
    await once(account, "change");
  }

  const created = account.get("created");
  let project_map = projects.get("project_map")!;
  if (project_map.size == 0) {
    // no known projects -- could be a new account, or could be an old account and no *recent* projects
    if (
      (created?.valueOf() ?? Date.now()) >=
      Date.now() - 2 * 24 * 60 * 60 * 1000
    ) {
      // new account -- make a project
      return await create("My First Project");
    } else {
      // old account but no projects -- try loading all.
      const projectActions = redux.getActions("projects");
      await projectActions.load_all_projects();
      project_map = projects.get("project_map")!;
      if (project_map.size == 0) {
        // still nothing -- just create
        return await create();
      }
    }
  }

  const account_id = account.get("account_id");

  // now there should be at least one project in project_map.
  // Is there a non-deleted non-hidden project?
  const options: any[] = [];
  for (const [_, project] of project_map) {
    if (project.get("deleted")) {
      continue;
    }
    if (project.getIn(["users", account_id, "hide"])) {
      continue;
    }
    options.push(project);
  }
  if (options.length == 0) {
    return await create();
  }

  // Sort the projects by when YOU were last active on the project, or if you were
  // never active on any project, by when the projects was last_edited.
  const usedByYou = options.filter((x) => x.getIn(["last_active", account_id]));

  if (usedByYou.length == 0) {
    //  you were never active on any project, so just return project most recently edited
    options.sort((x, y) => -cmp(x.get("last_edited"), y.get("last_edited")));
    return options[0].get("project_id");
  }

  usedByYou.sort(
    (x, y) =>
      -cmp(
        x.getIn(["last_active", account_id]),
        y.getIn(["last_active", account_id]),
      ),
  );
  return usedByYou[0].get("project_id");
}
