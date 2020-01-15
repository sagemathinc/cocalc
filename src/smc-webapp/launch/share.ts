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
import { len, uuid } from "smc-util/misc";
import { alert_message } from "../alerts";

interface ShareInfo {
  id: string;
  project_id: string;
  path: string;
  description?: string;
  license?: string;
}

export async function launch_share(launch: string): Promise<void> {
  const v = launch.split("/");
  const share_id = v[1];
  const path = v.slice(2).join("/");
  alert_message({
    type: "info",
    title: "Opening a copy of this shared content in a project...",
    timeout: 5
  });

  const store = redux.getStore("account");
  if (!store.get("is_ready")) {
    await once(store, "is_ready");
  }

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
  //console.log("public_path = ", public_path);
  if (public_path == null) {
    throw Error(`there is no public share with id ${share_id}`);
  }

  // Actual path is in the URL and can be much more refined than the share path.
  public_path.path = path;
  if (public_path.path.endsWith("/")) {
    public_path.path = public_path.path.slice(0, public_path.path.length - 1);
  }

  // What is our relationship to this public_path?
  const relationship: Relationship = await get_relationship_to_share(
    public_path.project_id
  );

  //console.log("relationship = ", relationship);

  switch (relationship) {
    case "collaborator":
      await open_share_as_collaborator(
        public_path.project_id,
        public_path.path
      );
      alert_message({
        type: "info",
        title: "Opened project with the shared content.",
        message:
          "Since your account already has edit access to this shared content, it has been opened for you.",
        block: true
      });
      break;
    case "anonymous":
      await open_share_in_the_anonymous_project(public_path);
      alert_message({
        type: "info",
        title: `Shared content opened - ${public_path.description}`,
        message:
          "You can edit and run this share!  Create an account in order to save your changes, collaborate with other people (and much more!).",
        block: true
      });
      break;
    case "fork":
      await open_share_in_a_new_project(public_path);
      alert_message({
        type: "info",
        title: `Shared content opened in a new project - ${public_path.description}`,
        message:
          "You can edit and run this share in this new project.  You may want to upgrade this project or copy files to another one of your projects.",
        block: true
      });
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

async function get_relationship_to_share(project_id: string): Promise<Relationship> {
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
  try {
    const project = (
      await query({ query: { projects: { project_id, last_active: null } } })
    ).query.projects;
    return project == null || len(project) == 0 ? "fork" : "collaborator";
  } catch (err) {
    // For non admin get an err when trying to get info about a project that
    // we don't have access to.
    return "fork";
  }
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
  info: ShareInfo
): Promise<void> {
  const target_project_id = await anonymous_project_id();
  // Change the project title and description to be related to the share, since
  // this is very likely the only way it is used (opening this project).
  await open_share_in_project(info.project_id, info.path, target_project_id);
  set_project_metadata(target_project_id, info);
}

async function open_share_in_project(
  project_id: string,
  path: string,
  target_project_id: string
): Promise<void> {
  // Open the project itself.
  const projects_actions = redux.getActions("projects");
  projects_actions.open_project({
    project_id: target_project_id,
    switch_to: true
  });

  // Copy the share to the target project.
  const actions = redux.getProjectActions(target_project_id);
  const id = uuid();
  actions.set_activity({
    id,
    status: "Copying shared content to your project..."
  });

  await callback2(webapp_client.copy_path_between_projects.bind(actions), {
    public: true,
    src_project_id: project_id,
    src_path: path,
    target_project_id,
    timeout: 120
  });

  actions.set_activity({ id, status: "Opening the shared content..." });

  // Then open the share:
  if (actions == null) {
    throw Error("target project must exist");
  }
  // We have to get the directory listing so we know whether we are opening
  // a directory or a file, since unfortunately that info is not part of the share.
  const i = path.lastIndexOf("/");
  const containing_path = i == -1 ? "" : path.slice(0, i);
  const filename = i == -1 ? path : path.slice(i + 1);
  await actions.set_current_path(containing_path);
  const store = redux.getProjectStore(target_project_id);
  await callback2(store.wait.bind(store), {
    until: () => store.getIn(["directory_listings", containing_path]) != null
  });
  const listing = store.getIn(["directory_listings", containing_path]);
  let isdir: boolean = false;
  for (const x of listing) {
    if (x.get("name") == filename) {
      isdir = !!x.get("isdir");
      break;
    }
  }
  if (isdir) {
    await actions.set_current_path(path);
  } else {
    await actions.open_file({
      path,
      foreground: true,
      foreground_project: true
    });
  }
  actions.set_activity({ id, stop: "" });
}

async function open_share_in_a_new_project(info: ShareInfo): Promise<void> {
  // Create a new project
  const actions = redux.getActions("projects");
  const target_project_id = await actions.create_project({
    title: "Share", // gets changed in a moment by set_project_metadata
    start: true,
    description: ""
  });
  set_project_metadata(target_project_id, info);
  await open_share_in_project(info.project_id, info.path, target_project_id);
}

function set_project_metadata(project_id: string, info: ShareInfo): void {
  const actions = redux.getActions("projects");
  const title = `Share - ${info.description ? info.description : info.path}`; // lame
  const description = `${info.path}\n\n${info.license}`;
  actions.set_project_title(project_id, title);
  actions.set_project_description(project_id, description);
}
