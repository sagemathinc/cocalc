/*
Functionality that mainly involves working with a specific project.
*/

import { required, defaults } from "smc-util/misc";
import {
  copy_without,
  encode_path,
  is_valid_uuid_string,
} from "smc-util/misc2";
import * as message from "smc-util/message";
import { connection_to_project } from "../project/websocket/connect";
import { API } from "../project/websocket/api";
import { redux } from "../app-framework";
import { WebappClient } from "./client";

import { Configuration, ConfigurationAspect } from "../project_configuration";

export interface ExecOpts {
  project_id: string;
  path?: string;
  command: string;
  args?: string[];
  timeout?: number;
  network_timeout?: number;
  max_output?: number;
  bash?: boolean;
  aggregate?: string | number | { value: string | number };
  err_on_exit?: boolean;
  env?: { [key: string]: string }; // custom environment variables.
}

export interface ExecOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  time: number; // time in ms, from user point of view.
}

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
    const base = (window as any).app_base_url ?? "";
    if (opts.path[0] === "/") {
      // absolute path to the root
      opts.path = ".smc/root" + opts.path; // use root symlink, which is created by start_smc
    }
    return encode_path(`${base}/${opts.project_id}/raw/${opts.path}`);
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
  }): Promise<void> {
    await this.call(message.project_set_quotas(opts));
  }

  public async websocket(project_id: string): Promise<any> {
    const group = redux.getStore("projects").get_my_group(project_id);
    if (group == null || group === "public") {
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
      network_timeout: undefined,
      max_output: undefined,
      bash: false,
      aggregate: undefined,
      err_on_exit: true,
      env: undefined,
    });

    const ws = await this.websocket(opts.project_id);
    const exec_opts = copy_without(opts, ["project_id"]);

    const msg = await ws.api.exec(exec_opts);
    if (msg.status && msg.status == "error") {
      throw new Error(msg.error);
    }
    delete msg.status;
    delete msg.error;
    return msg;
  }

  public async directory_listing(opts: {
    project_id: string;
    path: string;
    timeout?: number;
    hidden?: boolean;
  }): Promise<any> {
    if (opts.timeout == null) opts.timeout = 15;
    const api = await this.api(opts.project_id);
    const listing = await api.listing(
      opts.path,
      opts.hidden,
      opts.timeout * 1000
    );
    return { files: listing };
  }

  public async public_directory_listing(opts: {
    project_id: string;
    path: string;
    time?: boolean;
    start?: number;
    limit?: number;
    timeout?: number;
    hidden: false;
  }): Promise<any> {
    if (opts.start == null) opts.start = 0;
    if (opts.limit == null) opts.limit = -1;
    const timeout = opts.timeout;
    delete opts.timeout;
    return (
      await this.client.async_call({
        message: message.public_get_directory_listing(opts),
        timeout: timeout ?? 30,
      })
    ).result;
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
    if (!this.client.is_signed_in()) {
      // silently ignore if not signed in
      return;
    }

    // Throttle -- so if this function is called with the same project_id
    // twice in 20s, it's ignored (to avoid unnecessary network traffic).
    const last = this.touch_throttle[project_id];
    if (last != null && new Date().valueOf() - last <= 20000) {
      return;
    }
    this.touch_throttle[project_id] = new Date().valueOf();
    await this.call(message.touch_project({ project_id }));
  }
}
