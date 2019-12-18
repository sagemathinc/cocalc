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

import { redux } from "../app-framework";
import { query } from "../frame-editors/generic/client";

export async function launch_share(launch: string): void {
  const log = (...args) => console.log("launch_share", ...args);
  log(launch);
  const v = launch.split("/");
  const share_id = v[1];
  const path = v.slice(2).join("/");
  log("share_id=", share_id);
  log("path=", path);

  // Look up the project_id and path for the share from the database.
  const public_path = (
    await query({
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

  // Figure out to where we are going to copy the shared files.
  if (relationship == "collaborator") {
    // Easy: just open it and done!
    redux.getActions("projects").open_project({
      project_id: public_path.project_id,
      switch_to: true,
      target: "files/" + public_path.path
    });
    return;
  }
  throw Error("not implemented");

  // Open the target project

  // Copy the shared files to that project

  // Open path or directory with the shared files...
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
