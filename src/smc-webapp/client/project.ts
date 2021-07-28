/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Functionality that mainly involves working with a specific project.
*/

import {
  copy_without,
  encode_path,
  is_valid_uuid_string,
  required,
  defaults,
  coerce_codomain_to_numbers,
} from "smc-util/misc";
import * as message from "smc-util/message";
import { DirectoryListingEntry } from "smc-util/types";
import { connection_to_project } from "../project/websocket/connect";
import { API } from "../project/websocket/api";
import { redux } from "../app-framework";
import { WebappClient } from "./client";
import {
  allow_project_to_run,
  too_many_free_projects,
} from "../project/client-side-throttle";
import { ProjectInfo, project_info } from "../project/websocket/project-info";
import {
  ProjectStatus,
  project_status,
} from "../project/websocket/project-status";
import { UsageInfoWS, get_usage_info } from "../project/websocket/usage-info";
import { ensure_project_running } from "../project/project-start-warning";
import { Configuration, ConfigurationAspect } from "../project_configuration";
import { join } from "path";

export interface ExecOpts {
  project_id: string;
  path?: string;
  command: string;
  args?: string[];
  timeout?: number;
  max_output?: number;
  bash?: boolean;
  aggregate?: string | number | { value: string | number };
  err_on_exit?: boolean;
  env?: { [key: string]: string }; // custom environment variables.
  cb?: Function; // if given use a callback interface *instead* of async.
}
export const ExecOpts = null; // webpack + TS es2020 modules need this

export interface ExecOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  time: number; // time in ms, from user point of view.
}
export const ExecOutput = null; // webpack + TS es2020 modules need this

export class ProjectClient {
  private client: WebappClient;
  private touch_throttle: { [project_id: string]: number } = {};

  constructor(client: WebappClient) {
    this.client = client;
  }

  private async call(message: object): Promise<any> {
    return await this.client.async_call({ message });
  }

  public async write_text_file(opts: {
    project_id: string;
    path: string;
    content: string;
  }): Promise<void> {
    return await this.call(message.write_text_file_to_project(opts));
  }

  public async read_text_file(opts: {
    project_id: string; // string or array of strings
    path: string; // string or array of strings
  }): Promise<string> {
    return (await this.call(message.read_text_file_from_project(opts))).content;
  }

  // Like "read_text_file" above, except the callback
  // message gives a url from which the file can be
  // downloaded using standard AJAX.
  public read_file(opts: {
    project_id: string; // string or array of strings
    path: string; // string or array of strings
  }): string {
    const base_path = window.app_base_path;
    if (opts.path[0] === "/") {
      // absolute path to the root
      opts.path = ".smc/root" + opts.path; // use root symlink, which is created by start_smc
    }
    return encode_path(join(base_path, `${opts.project_id}/raw/${opts.path}`));
  }

  public async copy_path_between_projects(opts: {
    public?: boolean; // TODO: should get deprecated because of share server.
    src_project_id: string; // id of source project
    src_path: string; // relative path of director or file in the source project
    target_project_id: string; // if of target project
    target_path?: string; // defaults to src_path
    overwrite_newer?: boolean; // overwrite newer versions of file at destination (destructive)
    delete_missing?: boolean; // delete files in dest that are missing from source (destructive)
    backup?: boolean; // make ~ backup files instead of overwriting changed files
    timeout?: number; // how long to wait for the copy to complete before reporting "error" (though it could still succeed)
  }): Promise<void> {
    const is_public = opts.public;
    delete opts.public;

    if (opts.target_path == null) {
      opts.target_path = opts.src_path;
    }

    const mesg = is_public
      ? message.copy_public_path_between_projects(opts)
      : message.copy_path_between_projects(opts);
    mesg.wait_until_done = true; // TODO: our UI only supports this fornow.

    await this.client.async_call({
      timeout: opts.timeout,
      message: mesg,
      allow_post: false, // since it may take too long
    });
  }

  // Set a quota parameter for a given project.
  // As of now, only user in the admin group can make these changes.
  public async set_quotas(opts: {
    project_id: string;
    memory?: number; // see message.js for the units, etc., for all these settings
    memory_request?: number;
    cpu_shares?: number;
    cores?: number;
    disk_quota?: number;
    mintime?: number;
    network?: number;
    member_host?: number;
    always_running?: number;
  }): Promise<void> {
    // we do some extra work to ensure all the quotas are numbers (typescript isn't
    // enough; sometimes client code provides strings, which can cause lots of trouble).
    const x = coerce_codomain_to_numbers(copy_without(opts, ["project_id"]));
    await this.call(
      message.project_set_quotas({ ...x, ...{ project_id: opts.project_id } })
    );
  }

  public async websocket(project_id: string): Promise<any> {
    const store = redux.getStore("projects");
    // Wait until project is running (or admin and not on project)
    await store.async_wait({
      until: () => {
        const state = store.get_state(project_id);
        if (state == null && redux.getStore("account")?.get("is_admin")) {
          // is admin so doesn't know project state -- just immediately
          // try, which  will cause project to run
          return true;
        }
        return state == "running";
      },
    });

    // get_my_group returns undefined when the various info to
    // determine this isn't yet loaded.  For some connections
    // this websocket function gets called before that info is
    // loaded, which can cause trouble.
    let group: string | undefined;
    await store.async_wait({
      until: () => (group = store.get_my_group(project_id)) != null,
    });
    if (group == "public") {
      throw Error("no access to project websocket");
    }
    return await connection_to_project(project_id);
  }

  public async api(project_id: string): Promise<API> {
    return (await this.websocket(project_id)).api;
  }

  /*
    Execute code in a given project.

    Aggregate option -- use like this:

        webapp.exec
            aggregate: timestamp (or something else sequential)

    means: if there are multiple attempts to run the given command with the same
    time, they are all aggregated and run only one time by the project.   If requests
    comes in with a newer time, they all run in another group after the first
    one finishes.    The timestamp will usually come from something like the "last save
    time" (which is stored in the db), which they client will know.  This is used, e.g.,
    for operations like "run rst2html on this file whenever it is saved."
    */
  public async exec(opts: ExecOpts): Promise<ExecOutput> {
    opts = defaults(opts, {
      project_id: required,
      path: "",
      command: required,
      args: [],
      timeout: 30,
      max_output: undefined,
      bash: false,
      aggregate: undefined,
      err_on_exit: true,
      env: undefined,
      cb: undefined, // if given use a callback interface instead of async
    });

    if (
      !(await ensure_project_running(
        opts.project_id,
        `execute the command ${opts.command}`
      ))
    ) {
      return {
        stdout: "",
        stderr: "You must start the project first",
        exit_code: 1,
        time: 0,
      };
    }

    try {
      const ws = await this.websocket(opts.project_id);
      const exec_opts = copy_without(opts, ["project_id"]);

      const msg = await ws.api.exec(exec_opts);
      if (msg.status && msg.status == "error") {
        throw new Error(msg.error);
      }
      delete msg.status;
      delete msg.error;
      if (opts.cb == null) {
        return msg;
      } else {
        opts.cb(undefined, msg);
        return msg;
      }
    } catch (err) {
      if (opts.cb == null) {
        throw err;
      } else {
        if (!err.message) {
          // Important since err.message can be falsey, e.g., for Error(''), but toString will never be falsey.
          opts.cb(err.toString());
        } else {
          opts.cb(err.message);
        }
        return { stdout: "", stderr: err.message, exit_code: 1, time: 0 }; // should be ignored; this is just to make typescript happy.
      }
    }
  }

  // Directly compute the directory listing.  No caching or other information
  // is used -- this just sends a message over the websocket requesting
  // the backend node.js project process to compute the listing.
  public async directory_listing(opts: {
    project_id: string;
    path: string;
    timeout?: number;
    hidden?: boolean;
  }): Promise<{ files: DirectoryListingEntry[] }> {
    if (opts.timeout == null) opts.timeout = 15;
    const api = await this.api(opts.project_id);
    const listing = await api.listing(
      opts.path,
      opts.hidden,
      opts.timeout * 1000
    );
    return { files: listing };
  }

  public async public_get_text_file(opts: {
    project_id: string;
    path: string;
  }): Promise<string> {
    return (await this.call(message.public_get_text_file(opts))).data;
  }

  public async find_directories(opts: {
    project_id: string;
    query?: string; // see the -iname option to the UNIX find command.
    path?: string; // Root path to find directories from
    exclusions?: string[]; // paths relative to `opts.path`. Skips whole sub-trees
    include_hidden?: boolean;
  }): Promise<{
    query: string;
    path: string;
    project_id: string;
    directories: string[];
  }> {
    opts = defaults(opts, {
      project_id: required,
      query: "*", // see the -iname option to the UNIX find command.
      path: ".", // Root path to find directories from
      exclusions: undefined, // Array<String> Paths relative to `opts.path`. Skips whole sub-trees
      include_hidden: false,
    });
    if (opts.path == null || opts.query == null)
      throw Error("bug -- cannot happen");

    const args: string[] = [
      opts.path,
      "-xdev",
      "!",
      "-readable",
      "-prune",
      "-o",
      "-type",
      "d",
      "-iname",
      `'${opts.query}'`,
      "-readable",
    ];
    if (opts.exclusions != null) {
      for (const excluded_path of opts.exclusions) {
        args.push(
          `-a -not \\( -path '${opts.path}/${excluded_path}' -prune \\)`
        );
      }
    }

    args.push("-print");
    const command = `find ${args.join(" ")}`;

    const result = await this.exec({
      // err_on_exit = false: because want this to still work even if there's a nonzero exit code,
      // which might happen if find hits a directory it can't read, e.g., a broken ~/.snapshots.
      err_on_exit: false,
      project_id: opts.project_id,
      command,
      timeout: 60,
      aggregate: Math.round(new Date().valueOf() / 5000), // aggregate calls into 5s windows, in case multiple clients ask for same find at once...
    });
    const n = opts.path.length + 1;
    let v = result.stdout.split("\n");
    if (!opts.include_hidden) {
      v = v.filter((x) => x.indexOf("/.") === -1);
    }
    v = v.filter((x) => x.length > n).map((x) => x.slice(n));
    return {
      query: opts.query,
      path: opts.path,
      project_id: opts.project_id,
      directories: v,
    };
  }

  // This is async, so do "await smc_webapp.configuration(...project_id...)".
  public async configuration(
    project_id: string,
    aspect: ConfigurationAspect,
    no_cache: boolean
  ): Promise<Configuration> {
    if (!is_valid_uuid_string(project_id)) {
      throw Error("project_id must be a valid uuid");
    }
    return (await this.api(project_id)).configuration(aspect, no_cache);
  }

  // Remove all upgrades from all projects that this user collaborates on.
  public async remove_all_upgrades(projects?: string[]): Promise<void> {
    await this.call(message.remove_all_upgrades({ projects }));
  }

  public async touch(project_id: string): Promise<void> {
    const state = redux.getStore("projects")?.get_state(project_id);
    if (!(state == null && redux.getStore("account")?.get("is_admin"))) {
      // not trying to view project as admin so do some checks
      if (!allow_project_to_run(project_id)) return;
      if (!this.client.is_signed_in()) {
        // silently ignore if not signed in
        return;
      }
      if (state != "running") {
        // not running so don't touch (user must explicitly start first)
        return;
      }
    }

    // Throttle -- so if this function is called with the same project_id
    // twice in 3s, it's ignored (to avoid unnecessary network traffic).
    // Do not make the timeout long, since that can mess up
    // getting the hub-websocket to connect to the project.
    const last = this.touch_throttle[project_id];
    if (last != null && new Date().valueOf() - last <= 3000) {
      return;
    }
    this.touch_throttle[project_id] = new Date().valueOf();
    try {
      await this.call(message.touch_project({ project_id }));
    } catch (err) {
      // silently ignore; this happens, e.g., if you touch too frequently,
      // and shouldn't be fatal and break other things.
      // NOTE: this is a bit ugly for now -- basically the
      // hub returns an error regarding actually touching
      // the project (updating the db), but it still *does*
      // ensure there is a TCP connection to the project.
    }
  }

  // Print file to pdf
  // The printed version of the file will be created in the same directory
  // as path, but with extension replaced by ".pdf".
  // Only used for sagews, and would be better done with websocket api anyways...
  public async print_to_pdf(opts: {
    project_id: string;
    path: string;
    options?: any; // optional options that get passed to the specific backend for this file type
    timeout?: number; // client timeout -- some things can take a long time to print!
  }): Promise<string> {
    // returns path to pdf file
    if (opts.options == null) opts.options = {};
    opts.options.timeout = opts.timeout; // timeout on backend

    return (
      await this.client.async_call({
        message: message.local_hub({
          project_id: opts.project_id,
          message: message.print_to_pdf({
            path: opts.path,
            options: opts.options,
          }),
        }),
        timeout: opts.timeout,
        allow_post: false,
      })
    ).path;
  }

  public async create(opts: {
    title: string;
    description: string;
    image?: string;
    start?: boolean;
    license?: string; // "license_id1,license_id2,..." -- if given, create project with these licenses applied
  }): Promise<string> {
    if (opts.start && too_many_free_projects()) {
      // don't auto-start it if too many projects already running.
      opts.start = false;
    }
    const { project_id } = await this.client.async_call({
      allow_post: false, // since gets called for anonymous and cookie not yet set.
      message: message.create_project(opts),
    });

    this.client.tracking_client.user_tracking("create_project", {
      project_id,
      title: opts.title,
    });

    return project_id;
  }

  // Disconnect whatever hub we are connected to from the project
  // Adding this right now only for debugging/dev purposes!
  public async disconnect_hub_from_project(project_id: string): Promise<void> {
    await this.call(message.disconnect_from_project({ project_id }));
  }

  public async realpath(opts: {
    project_id: string;
    path: string;
  }): Promise<string> {
    return (await this.api(opts.project_id)).realpath(opts.path);
  }

  // Add and remove a license from a project.  Note that these
  // might not be used to implement anything in the client frontend, but
  // are used via the API, and this is a convenient way to test them.
  public async add_license_to_project(
    project_id: string,
    license_id: string
  ): Promise<void> {
    await this.call(message.add_license_to_project({ project_id, license_id }));
  }

  public async remove_license_from_project(
    project_id: string,
    license_id: string
  ): Promise<void> {
    await this.call(
      message.remove_license_from_project({ project_id, license_id })
    );
  }

  public project_info(project_id: string): ProjectInfo {
    return project_info(this.client, project_id);
  }

  public project_status(project_id: string): ProjectStatus {
    return project_status(this.client, project_id);
  }

  public usage_info(project_id: string): UsageInfoWS {
    return get_usage_info(project_id);
  }
}
