/*
  With minimal friction copy a share over from some public project
  to a project owned by this user, and point the browser at the directory
  or file containing the share.

  - if anon user, copy into *the* anon project, and DO not make the default
    notebook there.

  - if not anon user:
     - if you are a collaborator on the project (or an admin) with this share,
       open that project and go to the appropriate path
     - if you are not a collaborator, make a new project whose name is maybe
       the name or descripiton of the share if possible (or the path); that's
       simple and clean.  Maybe include info in project description about license,
       original URL, etc., or a metadata file with that (which could be used to
       improve the directory listing).

  TODO/issues:

  - It's entirely possible that the share is HUGE (e.g., my website is like 60GB, or
    maybe an instructors posts a 2GB data file for students), so we don't want to
    just naively copy some massive amount of files.  I'm not sure how to prevent this
    for #v0 though.

  - We're just going to use the "copy between projects" api, so that requires starting
    up the project that is the source of the shared files.  It would be much nicer to
    copy directly from the share server.  This would require creating a new service, or
    making manage-copy able to have the share server as a source (which would be
    natural).

  - What if a file depends on some other files.  Then the directory has to get copied to
    get those dependent files, which is a little confusing.

  I'm not making the above blockers for this, because they have been problems exactly as
  is for years now, and the current UI requires users to manually do very hard stuff,
  which I doubt anybody ever does...
*/

/* The launch string should be of the form:
     "launch/[shared_id]/path/to/doc/in/a/share"
*/

import { delay } from "awaiting";
import { redux } from "../app-framework";
import { query } from "../frame-editors/generic/client";
import { webapp_client } from "../webapp-client";
import { callback2, once } from "smc-util/async-utils";

export async function launch_share(launch: string): void {
  const log = (...args) => console.log("launch_share", ...args);
  log(launch);
  const v = launch.split("/");
  const share_id = v[1];
  const path = v.slice(2).join("/");
  log("share_id=", share_id);
  log("path=", path);

  if (!webapp_client.is_signed_in()) await once(webapp_client, "signed_in");

  // Look up the project_id and path for the share from the database.
  const public_path = (
    await query({
      no_post: true, // (ugly) since this call is *right* after making an account, so we need to avoid racing for cookie to be set.
      query: {
        public_paths_by_id: {
          id: share_id,
          project_id: null,
          path: null,
          description: null,
          license: null
        }
      }
    })
  ).query.public_paths_by_id;
  log("public_path = ", public_path);
  if (public_path == null) {
    throw Error(`there is no public share with id ${share_id}`);
  }

  // What is our relationship to this public_path?
  const relationship: Relationship = await get_relationship_to_share(
    public_path.project_id
  );

  console.log("relationship = ", relationship);

  switch (relationship) {
    case "collaborator":
      await open_share_as_collaborator(
        public_path.project_id,
        public_path.path
      );
      break;
    case "anonymous":
      await open_share_in_the_anonymous_project(
        public_path.project_id,
        public_path.path
      );
      break;
    case "fork":
      await open_share_in_a_new_project(
        public_path.project_id,
        public_path.path,
        public_path.description,
        public_path.license
      );
      break;
    default:
      throw Error(`unknown relationship "${relationship}"`);
  }

  // TODO -- maybe -- write some sort of metadata or a markdown file (e.g., source.md)
  // somewhere explaining where this shared file came from (share link, description, etc.).
}

type Relationship =
  | "collaborator" // user is a collaborator on the shared project (so just directly open the shared project)
  | "fork" // user is a normal user who needs to make a fork of the shared files in a new project (a fork)
  | "anonymous"; // user is anonymous, so make a copy of the shared files in their own project

async function get_relationship_to_share(project_id: string): Relationship {
  const account_store = redux.getStore("account");
  if (account_store == null) {
    throw Error("acount_store MUST be defined");
  }
  if (!account_store.get("is_logged_in")) {
    throw Error(
      "user must be signed in before share launch action is performed"
    );
  }
  if (account_store.get("is_anonymous")) {
    return "anonymous";
  }
  if (account_store.get("is_admin")) {
    return "collaborator"; // admin is basically viewed as collab on everything for permissions.
  }
  // OK, now we have a normal non-anonymous non-admin user that is signed in.
  // Decide if this is a project they are a collab on or not.
  // We do this robustly by querying the projects table for this one project;
  // if we are on this project, we'll get a result back, and if not an empty
  // object back (since it is outside of our "universe").  Also, we include
  // last_active in the query, since otherwise the query always just comes back
  // empty as a sort of no-op (probably an edge case bug).
  const project = (
    await query({ query: { projects: { project_id, last_active: null } } })
  ).query.projects;
  return project == null ? "fork" : "collaborator";
}

// Easy: just open it and done!
function open_share_as_collaborator(project_id: string, path: string): void {
  const target = "files/" + path;
  redux.getActions("projects").open_project({
    project_id,
    switch_to: true,
    target
  });
}

async function anonymous_project_id(max_time_s: number = 30): Promise<string> {
  // Anonymous users should have precisely one project, so
  // we copy the files to that project.  The issue is just
  // that the project is being created at almost the exact
  // same time that this launch action is being handled.
  // So we'll try waiting for there to be a project for up to
  // 30 seconds, then give up.
  for (let t = 0; t < max_time_s; t++) {
    const account_store = redux.getStore("account");
    const projects_store = redux.getStore("projects");
    if (
      account_store != null &&
      projects_store != null &&
      account_store.get("is_anonymous")
    ) {
      const project_map = projects_store.get("project_map");
      if (project_map != null && project_map.size > 0) {
        for (const x of project_map) {
          return x[0];
        }
      }
    }
    await delay(1000);
  }
  throw Error(
    `unable to determine anonymous project after waiting ${max_time_s} seconds -- something is wrong`
  );
}

async function open_share_in_the_anonymous_project(
  project_id: string,
  path: string
): Promise<void> {
  const target_project_id = await anonymous_project_id();
  open_share_in_project(project_id, path, target_project_id);
}

async function open_share_in_project(
  project_id: string,
  path: string,
  target_project_id: string
): Promise<void> {
  // Copy the share to the target project.
  await callback2(webapp_client.copy_path_between_projects, {
    public: true,
    src_project_id: project_id,
    src_path: path,
    target_project_id,
    target_path: path,
    timeout: 120
  });

  // Then open it.
  const actions = redux.getProjectActions(target_project_id);
  if (actions == null) {
    throw Error("target project must exist");
  }
  await actions.open_file({ path, foreground: true, foreground_project: true });
}

async function open_share_in_a_new_project(
  project_id: string,
  path: string,
  description: string | undefined,
  license: string | undefined
): Promise<void> {
  // Create a new project
  const actions = redux.getActions("projects");
  const target_project_id = await actions.create_project({
    title: `${description} - Share`,
    start: true,
    description: license // TODO - pretty lame
  });
  await open_share_in_project(project_id, path, target_project_id);
}
