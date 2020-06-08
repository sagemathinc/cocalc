/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
import { webapp_client } from "../webapp-client";
import { callback2, once, retry_until_success } from "smc-util/async-utils";
import { len, uuid } from "smc-util/misc";
import { alert_message } from "../alerts";
import { ANON_PROJECT_TITLE } from "../client/anonymous-setup";
import { DEFAULT_COMPUTE_IMAGE } from "../../smc-util/compute-images";
import { CSILauncher } from "../launch/custom-image";

type Relationship =
  | "collaborator" // user is a collaborator on the shared project (so just directly open the shared project)
  | "fork" // user is a normal user who needs to make a fork of the shared files in a new project (a fork)
  | "anonymous"; // user is anonymous, so make a copy of the shared files in their own project

interface ShareInfo {
  id: string;
  project_id: string;
  path: string;
  description?: string;
  license?: string;
  compute_image: string;
}

export class ShareLauncher {
  readonly share_id: string;
  readonly path: string;
  private info: ShareInfo;

  constructor(launch: string) {
    const v = launch.split("/");
    this.share_id = v[1];
    this.path = v.slice(2).join("/");
  }

  public async launch() {
    alert_message({
      type: "info",
      title: "Opening a copy of this shared content in a project...",
      timeout: 5,
    });

    const store = redux.getStore("account");
    if (!store.get("is_ready")) {
      await once(store, "is_ready");
    }

    // Look up the project_id and path for the share from the database.
    const info = (this.info = (
      await query({
        no_post: true, // (ugly) since this call is *right* after making an account, so we need to avoid racing for cookie to be set.
        query: {
          public_paths_by_id: {
            id: this.share_id,
            project_id: null,
            path: null,
            description: null,
            license: null,
            compute_image: null,
          },
        },
      })
    ).query.public_paths_by_id);

    //console.log("info = ", info);
    if (info == null) {
      throw Error(`there is no public share with id ${this.share_id}`);
    }

    // Actual path is in the URL and can be much more refined than the share path.
    info.path = this.path;
    if (info.path.endsWith("/")) {
      info.path = info.path.slice(0, info.path.length - 1);
    }

    // the compute image's default is "default" (from the time before this field existed)
    // don't change it to DEFAULT_COMPUTE_IMAGE
    info.compute_image = info.compute_image ?? "default";

    // What is our relationship to this public_path?
    const relationship: Relationship = await this.get_relationship_to_share(
      info.project_id
    );

    //console.log("relationship = ", relationship);

    switch (relationship) {
      case "collaborator":
        await this.open_share_as_collaborator();
        alert_message({
          type: "info",
          title: "Opened project with the shared content.",
          message:
            "Since your account already has edit access to this shared content, it has been opened for you.",
          block: true,
        });
        break;
      case "anonymous":
        await this.open_share_in_the_anonymous_project();
        alert_message({
          type: "info",
          title: `Shared content opened - ${info.description}`,
          message:
            "You can edit and run this share!  Create an account in order to save your changes, collaborate with other people (and much more!).",
          block: true,
        });
        break;
      case "fork":
        await this.open_share_in_a_new_project();
        alert_message({
          type: "info",
          title: `Shared content opened in a new project - ${info.description}`,
          message:
            "You can edit and run this share in this new project.  You may want to upgrade this project or copy files to another one of your projects.",
          block: true,
        });
        break;
      default:
        throw Error(`unknown relationship "${relationship}"`);
    }

    // TODO -- maybe -- write some sort of metadata or a markdown file (e.g., source.md)
    // somewhere explaining where this shared file came from (share link, description, etc.).
  }

  private async get_relationship_to_share(
    project_id: string
  ): Promise<Relationship> {
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
  private open_share_as_collaborator(): void {
    const { project_id, path } = this.info;
    const target = "files/" + path;
    redux.getActions("projects").open_project({
      project_id,
      switch_to: true,
      target,
    });
  }

  private async create_and_setup_project(title): Promise<void> {
    const { compute_image, project_id, path } = this.info;
    const target_project_id = await (async function () {
      try {
        if (
          compute_image === "default" ||
          compute_image === DEFAULT_COMPUTE_IMAGE
        ) {
          const csi = new CSILauncher(compute_image);
          return csi.launch();
        } else {
          // this is the default project
          const actions = redux.getActions("projects");
          console.log("creating anonymous project");
          const project_id = await actions.create_project({
            title,
            start: true,
            description: "",
          });
          console.log("opening project");
          actions.open_project({ project_id, switch_to: true });
          return project_id;
        }
      } catch (err) {
        throw Error(`unable to create project ${err} -- something is wrong`);
      }
    })();

    // Change the project title and description to be related to the share, since
    // this is very likely the only way it is used (opening this project).
    this.set_project_metadata(target_project_id);
    await this.open_share_in_project(project_id, path, target_project_id);
  }

  private async open_share_in_the_anonymous_project(
    max_time_s: number = 30
  ): Promise<void> {
    // We wait until the anonymous user exists and then create a project
    // (default project creation is intercepted in client/anonymous-setup)
    try {
      await retry_until_success({
        max_time: max_time_s * 1000,
        f: async () => {
          const account_store = redux.getStore("account");
          if (account_store == null || !account_store.get("is_anonymous")) {
            throw new Error("account does not exist yet ...");
          }
        },
      });
      this.create_and_setup_project(ANON_PROJECT_TITLE);
    } catch {
      throw Error(
        `unable to get anonymous user after waiting ${max_time_s} seconds -- something is wrong`
      );
    }
  }

  private async open_share_in_project(
    project_id: string,
    path: string,
    target_project_id: string
  ): Promise<void> {
    // Open the project itself.
    const projects_actions = redux.getActions("projects");
    projects_actions.open_project({
      project_id: target_project_id,
      switch_to: true,
    });

    // Copy the share to the target project.
    const actions = redux.getProjectActions(target_project_id);
    const id = uuid();
    actions.set_activity({
      id,
      status: "Copying shared content to your project...",
    });

    await webapp_client.project_client.copy_path_between_projects({
      public: true,
      src_project_id: project_id,
      src_path: path,
      target_project_id,
      timeout: 120,
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
      until: () => store.getIn(["directory_listings", containing_path]) != null,
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
        foreground_project: true,
      });
    }
    actions.set_activity({ id, stop: "" });
  }

  private async open_share_in_a_new_project(): Promise<void> {
    // Create a new project
    this.create_and_setup_project("Share");
  }

  private set_project_metadata(project_id: string): void {
    const { description, path, license } = this.info;
    const actions = redux.getActions("projects");
    const title = `Share - ${description ? description : path}`; // lame
    const project_description = `${path}\n\n${license}`;
    actions.set_project_title(project_id, title);
    actions.set_project_description(project_id, project_description);
  }
}
