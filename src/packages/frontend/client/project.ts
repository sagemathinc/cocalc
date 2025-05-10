/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Functionality that mainly involves working with a specific project.
*/

import { join } from "path";
import { redux } from "@cocalc/frontend/app-framework";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { dialogs } from "@cocalc/frontend/i18n";
import { getIntl } from "@cocalc/frontend/i18n/get-intl";
import { allow_project_to_run } from "@cocalc/frontend/project/client-side-throttle";
import { ensure_project_running } from "@cocalc/frontend/project/project-start-warning";
import { API } from "@cocalc/frontend/project/websocket/api";
import { connection_to_project } from "@cocalc/frontend/project/websocket/connect";
import {
  ProjectInfo,
  project_info,
} from "@cocalc/frontend/project/websocket/project-info";
import {
  ProjectStatus,
  project_status,
} from "@cocalc/frontend/project/websocket/project-status";
import {
  UsageInfoWS,
  get_usage_info,
} from "@cocalc/frontend/project/websocket/usage-info";
import {
  Configuration,
  ConfigurationAspect,
} from "@cocalc/frontend/project_configuration";
import { HOME_ROOT } from "@cocalc/util/consts/files";
import type { ApiKey } from "@cocalc/util/db-schema/api-keys";
import {
  isExecOptsBlocking,
  type ExecOpts,
  type ExecOutput,
} from "@cocalc/util/db-schema/projects";
import * as message from "@cocalc/util/message";
import {
  coerce_codomain_to_numbers,
  copy_without,
  defaults,
  encode_path,
  is_valid_uuid_string,
  required,
} from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { DirectoryListingEntry } from "@cocalc/util/types";
import httpApi from "./api";
import { WebappClient } from "./client";
import { throttle } from "lodash";
import { writeFile, type WriteFileOptions } from "@cocalc/nats/files/write";
import { readFile, type ReadFileOptions } from "@cocalc/nats/files/read";

export class ProjectClient {
  private client: WebappClient;
  private touch_throttle: { [project_id: string]: number } = {};

  constructor(client: WebappClient) {
    this.client = client;
  }

  private async call(message: object): Promise<any> {
    return await this.client.async_call({ message });
  }

  private natsApi = (project_id: string) => {
    return this.client.nats_client.projectApi({ project_id });
  };

  // This can write small text files in one message.
  public async write_text_file({
    project_id,
    path,
    content,
  }: {
    project_id: string;
    path: string;
    content: string;
  }): Promise<void> {
    await this.natsApi(project_id).system.writeTextFileToProject({
      path,
      content,
    });
  }

  // writeFile -- easily write **arbitrarily large text or binary files**
  // to a project from a readable stream or a string!
  writeFile = async (
    opts: WriteFileOptions & { content?: string },
  ): Promise<{ bytes: number; chunks: number }> => {
    if (opts.content != null) {
      // @ts-ignore -- typescript doesn't like this at all, but it works fine.
      opts.stream = new Blob([opts.content], { type: "text/plain" }).stream();
    }
    return await writeFile(opts);
  };

  // readFile -- read **arbitrarily large text or binary files**
  // from a project via a readable stream.
  // Look at the code below if you want to stream a file for memory
  // efficiency...
  readFile = async (opts: ReadFileOptions): Promise<Buffer> => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of await readFile(opts)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };

  public async read_text_file({
    project_id,
    path,
  }: {
    project_id: string; // string or array of strings
    path: string; // string or array of strings
  }): Promise<string> {
    return await this.natsApi(project_id).system.readTextFileFromProject({
      path,
    });
  }

  // Like "read_text_file" above, except the callback
  // message gives a url from which the file can be
  // downloaded using standard AJAX.
  public read_file(opts: {
    project_id: string; // string or array of strings
    path: string; // string or array of strings
    compute_server_id?: number;
  }): string {
    const base_path = appBasePath;
    if (opts.path[0] === "/") {
      // absolute path to the root
      opts.path = HOME_ROOT + opts.path; // use root symlink, which is created by start_smc
    }
    let url = join(
      base_path,
      `${opts.project_id}/files/${encode_path(opts.path)}`,
    );
    if (opts.compute_server_id) {
      url += `?id=${opts.compute_server_id}`;
    }
    return url;
  }

  public async copy_path_between_projects(opts: {
    public?: boolean; // used e.g., by share server landing page action.
    src_project_id: string; // id of source project
    src_path: string; // relative path of director or file in the source project
    target_project_id: string; // if of target project
    target_path?: string; // defaults to src_path
    overwrite_newer?: boolean; // overwrite newer versions of file at destination (destructive)
    delete_missing?: boolean; // delete files in dest that are missing from source (destructive)
    backup?: boolean; // make ~ backup files instead of overwriting changed files
    timeout?: number; // **timeout in seconds** -- how long to wait for the copy to complete before reporting "error" (though it could still succeed)
    exclude?: string[]; // list of patterns to exclude; this uses exactly the (confusing) rsync patterns
  }): Promise<void> {
    const is_public = opts.public;
    delete opts.public;

    if (opts.target_path == null) {
      opts.target_path = opts.src_path;
    }

    const mesg = is_public
      ? message.copy_public_path_between_projects(opts)
      : message.copy_path_between_projects(opts);
    mesg.wait_until_done = true; // TODO: our UI only supports this for now.

    // THIS CAN BE USEFUL FOR DEBUGGING!
    // mesg.debug_delay_s = 10;

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
      message.project_set_quotas({ ...x, ...{ project_id: opts.project_id } }),
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

  api = async (project_id: string): Promise<API> => {
    return (await this.websocket(project_id)).api;
  };

  /*
    Execute code in a given project or associated compute server.

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
  public async exec(opts: ExecOpts & { post?: boolean }): Promise<ExecOutput> {
    if ("async_get" in opts) {
      opts = defaults(opts, {
        project_id: required,
        compute_server_id: undefined,
        async_get: required,
        async_stats: undefined,
        async_await: undefined,
        post: false, // if true, uses the POST api through nextjs instead of the websocket api.
        timeout: 30,
        cb: undefined,
      });
    } else {
      opts = defaults(opts, {
        project_id: required,
        compute_server_id: undefined,
        filesystem: undefined,
        path: "",
        command: required,
        args: [],
        max_output: undefined,
        bash: false,
        aggregate: undefined,
        err_on_exit: true,
        env: undefined,
        post: false, // if true, uses the POST api through nextjs instead of the websocket api.
        async_call: undefined, // if given use a callback interface instead of async
        timeout: 30,
        cb: undefined,
      });
    }

    const intl = await getIntl();
    const msg = intl.formatMessage(dialogs.client_project_exec_msg, {
      blocking: isExecOptsBlocking(opts),
      arg: isExecOptsBlocking(opts) ? opts.command : opts.async_get,
    });

    if (!(await ensure_project_running(opts.project_id, msg))) {
      return {
        type: "blocking",
        stdout: "",
        stderr: intl.formatMessage(dialogs.client_project_exec_start_first),
        exit_code: 1,
        time: 0,
      };
    }

    const { post } = opts;
    delete opts.post;

    try {
      let msg;
      if (post) {
        // use post API
        msg = await httpApi("exec", opts);
      } else {
        const ws = await this.websocket(opts.project_id);
        const exec_opts = copy_without(opts, ["project_id"]);
        msg = await ws.api.exec(exec_opts);
      }
      if (msg.status && msg.status == "error") {
        throw new Error(msg.error);
      }
      if (msg.type === "blocking") {
        delete msg.status;
      }
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
        return {
          type: "blocking",
          stdout: "",
          stderr: err.message,
          exit_code: 1,
          time: 0, // should be ignored; this is just to make typescript happy.
        };
      }
    }
  }

  // Directly compute the directory listing.  No caching or other information
  // is used -- this just sends a message over the websocket requesting
  // the backend node.js project process to compute the listing.
  public async directory_listing(opts: {
    project_id: string;
    path: string;
    compute_server_id: number;
    timeout?: number;
    hidden?: boolean;
  }): Promise<{ files: DirectoryListingEntry[] }> {
    if (opts.timeout == null) opts.timeout = 15;
    const api = await this.api(opts.project_id);
    const listing = await api.listing(
      opts.path,
      opts.hidden,
      opts.timeout * 1000,
      opts.compute_server_id,
    );
    return { files: listing };
  }

  public async find_directories(opts: {
    project_id: string;
    query?: string; // see the -iwholename option to the UNIX find command.
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
      query: "*", // see the -iwholename option to the UNIX find command.
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
      "-iwholename", // See https://github.com/sagemathinc/cocalc/issues/5502
      `'${opts.query}'`,
      "-readable",
    ];
    if (opts.exclusions != null) {
      for (const excluded_path of opts.exclusions) {
        args.push(
          `-a -not \\( -path '${opts.path}/${excluded_path}' -prune \\)`,
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
      aggregate: Math.round(Date.now() / 5000), // aggregate calls into 5s windows, in case multiple clients ask for same find at once...
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
  // for reuseInFlight, see https://github.com/sagemathinc/cocalc/issues/7806
  public configuration = reuseInFlight(
    async (
      project_id: string,
      aspect: ConfigurationAspect,
      no_cache: boolean,
    ): Promise<Configuration> => {
      if (!is_valid_uuid_string(project_id)) {
        throw Error("project_id must be a valid uuid");
      }
      return (await this.api(project_id)).configuration(aspect, no_cache);
    },
  );

  // Remove all upgrades from all projects that this user collaborates on.
  public async remove_all_upgrades(projects?: string[]): Promise<void> {
    await this.call(message.remove_all_upgrades({ projects }));
  }

  touch_project = async (
    // project_id where activity occured
    project_id: string,
    // optional global id of a compute server (in the given project), in which case we also mark
    // that compute server as active, which keeps it running in case it has idle timeout configured.
    compute_server_id?: number,
  ): Promise<void> => {
    if (compute_server_id) {
      // this is throttled, etc. and is independent of everything below.
      touchComputeServer({
        project_id,
        compute_server_id,
        client: this.client,
      });
      // that said, we do still touch the project, since if a user is actively
      // using a compute server, the project should also be considered active.
    }

    const state = redux.getStore("projects")?.get_state(project_id);
    if (!(state == null && redux.getStore("account")?.get("is_admin"))) {
      // not trying to view project as admin so do some checks
      if (!(await allow_project_to_run(project_id))) return;
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
    if (last != null && Date.now() - last <= 3000) {
      return;
    }
    this.touch_throttle[project_id] = Date.now();
    try {
      await this.client.nats_client.hub.db.touch({ project_id });
    } catch (err) {
      // silently ignore; this happens, e.g., if you touch too frequently,
      // and shouldn't be fatal and break other things.
      // NOTE: this is a bit ugly for now -- basically the
      // hub returns an error regarding actually touching
      // the project (updating the db), but it still *does*
      // ensure there is a TCP connection to the project.
    }
  };

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
    // "license_id1,license_id2,..." -- if given, create project with these licenses applied
    license?: string;
    // never use pool
    noPool?: boolean;
  }): Promise<string> {
    const project_id =
      await this.client.nats_client.hub.projects.createProject(opts);
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
    const real = (await this.api(opts.project_id)).realpath(opts.path);
    return real;
  }

  async isdir({
    project_id,
    path,
  }: {
    project_id: string;
    path: string;
  }): Promise<boolean> {
    const { stdout, exit_code } = await this.exec({
      project_id,
      command: "file",
      args: ["-Eb", path],
      err_on_exit: false,
    });
    return !exit_code && stdout.trim() == "directory";
  }

  // Add and remove a license from a project.  Note that these
  // might not be used to implement anything in the client frontend, but
  // are used via the API, and this is a convenient way to test them.
  public async add_license_to_project(
    project_id: string,
    license_id: string,
  ): Promise<void> {
    await this.call(message.add_license_to_project({ project_id, license_id }));
  }

  public async remove_license_from_project(
    project_id: string,
    license_id: string,
  ): Promise<void> {
    await this.call(
      message.remove_license_from_project({ project_id, license_id }),
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

  public ipywidgetsGetBuffer = reuseInFlight(
    async (
      project_id: string,
      path: string,
      model_id: string,
      buffer_path: string,
    ): Promise<ArrayBuffer> => {
      const actions = redux.getEditorActions(project_id, path);
      return await actions.jupyter_actions.ipywidgetsGetBuffer(
        model_id,
        buffer_path,
      );
    },
  );

  // getting, setting, editing, deleting, etc., the  api keys for a project
  public async api_keys(opts: {
    project_id: string;
    action: "get" | "delete" | "create" | "edit";
    password?: string;
    name?: string;
    id?: number;
    expire?: Date;
  }): Promise<ApiKey[] | undefined> {
    return await this.client.nats_client.hub.system.manageApiKeys(opts);
  }

  computeServers = (project_id) => {
    const cs = redux.getProjectActions(project_id)?.computeServers();
    if (cs == null) {
      throw Error("bug");
    }
    return cs;
  };

  getServerIdForPath = async ({
    project_id,
    path,
  }): Promise<number | undefined> => {
    return await this.computeServers(project_id)?.getServerIdForPath(path);
  };

  // will throw exception if compute servers dkv not yet initialized
  getServerIdForPathSync = ({ project_id, path }): number | undefined => {
    return this.computeServers(project_id).get(path);
  };
}

// (NOTE: this won't throw an exception)
const touchComputeServer = throttle(
  async ({ project_id, compute_server_id, client }) => {
    if (!compute_server_id) {
      // nothing to do
      return;
    }
    try {
      await client.async_query({
        query: {
          compute_servers: {
            project_id,
            id: compute_server_id,
            last_edited_user: client.server_time(),
          },
        },
      });
    } catch (err) {
      // just a warning -- if we can't connect then touching isn't something we should be doing anyways.
      console.log(
        "WARNING: failed to touch compute server -- ",
        { compute_server_id },
        err,
      );
    }
  },
  30000,
);
