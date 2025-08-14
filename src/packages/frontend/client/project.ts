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
import { WebappClient } from "./client";
import { throttle } from "lodash";
import { writeFile, type WriteFileOptions } from "@cocalc/conat/files/write";
import { readFile, type ReadFileOptions } from "@cocalc/conat/files/read";
import { type ProjectApi } from "@cocalc/conat/project/api";
import { type CopyOptions } from "@cocalc/conat/files/fs";

export class ProjectClient {
  private client: WebappClient;
  private touch_throttle: { [project_id: string]: number } = {};

  constructor(client: WebappClient) {
    this.client = client;
  }

  conatApi = (project_id: string, compute_server_id = 0): ProjectApi => {
    return this.client.conat_client.projectApi({
      project_id,
      compute_server_id,
    });
  };

  // This can write small text files in one message.
  write_text_file = async (opts): Promise<void> => {
    await this.writeFile(opts);
  };

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

  read_text_file = async ({
    project_id,
    path,
  }: {
    project_id: string; // string or array of strings
    path: string; // string or array of strings
  }): Promise<string> => {
    return await this.conatApi(project_id).system.readTextFileFromProject({
      path,
    });
  };

  // Like "read_text_file" above, except the callback
  // message gives a url from which the file can be
  // downloaded using standard AJAX.
  read_file = (opts: {
    project_id: string; // string or array of strings
    path: string; // string or array of strings
    compute_server_id?: number;
  }): string => {
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
  };

  copyPathBetweenProjects = async (opts: {
    src: { project_id: string; path: string | string[] };
    dest: { project_id: string; path: string };
    options?: CopyOptions;
  }): Promise<void> => {
    await this.client.conat_client.hub.projects.copyPathBetweenProjects(opts);
  };

  // Set a quota parameter for a given project.
  // As of now, only user in the admin group can make these changes.
  set_quotas = async (opts: {
    project_id: string;
    memory?: number;
    memory_request?: number;
    cpu_shares?: number;
    cores?: number;
    disk_quota?: number;
    mintime?: number;
    network?: number;
    member_host?: number;
    always_running?: number;
  }): Promise<void> => {
    // we do some extra work to ensure all the quotas are numbers (typescript isn't
    // enough; sometimes client code provides strings, which can cause lots of trouble).
    const x = coerce_codomain_to_numbers(copy_without(opts, ["project_id"]));
    await this.client.conat_client.hub.projects.setQuotas({
      ...x,
      project_id: opts.project_id,
    });
  };

  websocket = async (project_id: string): Promise<any> => {
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
  };

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
  exec = async (opts: ExecOpts & { post?: boolean }): Promise<ExecOutput> => {
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

    try {
      const ws = await this.websocket(opts.project_id);
      const exec_opts = copy_without(opts, ["project_id", "cb"]);
      const msg = await ws.api.exec(exec_opts);
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
  };

  // Directly compute the directory listing.  No caching or other information
  // is used -- this just sends a message over the websocket requesting
  // the backend node.js project process to compute the listing.
  directory_listing = async (opts: {
    project_id: string;
    path: string;
    compute_server_id: number;
    timeout?: number;
    hidden?: boolean;
  }): Promise<{ files: DirectoryListingEntry[] }> => {
    if (opts.timeout == null) opts.timeout = 15;
    const api = await this.api(opts.project_id);
    const listing = await api.listing(
      opts.path,
      opts.hidden,
      opts.timeout * 1000,
      opts.compute_server_id,
    );
    return { files: listing };
  };

  find_directories = async (opts: {
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
  }> => {
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
  };

  // This is async, so do "await smc_webapp.configuration(...project_id...)".
  // for reuseInFlight, see https://github.com/sagemathinc/cocalc/issues/7806
  configuration = reuseInFlight(
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
      await this.client.conat_client.hub.db.touch({ project_id });
    } catch (err) {
      // silently ignore; this happens, e.g., if you touch too frequently,
      // and shouldn't be fatal and break other things.
      // NOTE: this is a bit ugly for now -- basically the
      // hub returns an error regarding actually touching
      // the project (updating the db), but it still *does*
      // ensure there is a TCP connection to the project.
    }
  };

  // Print sagews to pdf
  // The printed version of the file will be created in the same directory
  // as path, but with extension replaced by ".pdf".
  // Only used for sagews.
  print_to_pdf = async ({
    project_id,
    path,
    options,
    timeout,
  }: {
    project_id: string;
    path: string;
    timeout?: number; // client timeout -- some things can take a long time to print!
    options?: any; // optional options that get passed to the specific backend for this file type
  }): Promise<string> => {
    return await this.client.conat_client
      .projectApi({ project_id })
      .editor.printSageWS({ path, timeout, options });
  };

  create = async (opts: {
    title: string;
    description: string;
    image?: string;
    start?: boolean;
    // "license_id1,license_id2,..." -- if given, create project with these licenses applied
    license?: string;
    // make exact clone of the files from this project:
    src_project_id?: string;
  }): Promise<string> => {
    const project_id =
      await this.client.conat_client.hub.projects.createProject(opts);
    this.client.tracking_client.user_tracking("create_project", {
      project_id,
      title: opts.title,
    });
    return project_id;
  };

  realpath = async (opts: {
    project_id: string;
    path: string;
  }): Promise<string> => {
    return (await this.api(opts.project_id)).realpath(opts.path);
  };

  isDir = async ({
    project_id,
    path,
  }: {
    project_id: string;
    path: string;
  }): Promise<boolean> => {
    const { stdout, exit_code } = await this.exec({
      project_id,
      command: "file",
      args: ["-Eb", path],
      err_on_exit: false,
    });
    return !exit_code && stdout.trim() == "directory";
  };

  ipywidgetsGetBuffer = reuseInFlight(
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
  api_keys = async (opts: {
    project_id: string;
    action: "get" | "delete" | "create" | "edit";
    password?: string;
    name?: string;
    id?: number;
    expire?: Date;
  }): Promise<ApiKey[] | undefined> => {
    return await this.client.conat_client.hub.system.manageApiKeys(opts);
  };

  computeServers = (project_id) => {
    const cs = redux.getProjectActions(project_id)?.computeServers();
    if (cs == null) {
      // this happens if something tries to access the compute server info after the project
      // tab is closed.  It shouldn't do that.
      throw Error("compute server information not available");
    }
    return cs;
  };

  getServerIdForPath = async ({
    project_id,
    path,
  }): Promise<number | undefined> => {
    return await this.computeServers(project_id)?.getServerIdForPath(path);
  };

  // will return undefined if compute servers not yet initialized
  getServerIdForPathSync = ({ project_id, path }): number | undefined => {
    const cs = this.computeServers(project_id);
    if (cs?.state != "connected") {
      return undefined;
    }
    return cs.get(path);
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

// Polyfill for Safari: Add async iterator support to ReadableStream if missing.
// E.g., this is missing in all versions of Safari as of May 2025 according to
//           https://caniuse.com/?search=ReadableStream%20async
// This breaks reading and writing files to projects, which is why this
// is here (e.g., the writeFile and readFile functions above).
// This might also matter for Jupyter.
// https://chatgpt.com/share/6827a476-dbe8-800e-9156-3326eb41baae
if (
  typeof ReadableStream !== "undefined" &&
  !ReadableStream.prototype[Symbol.asyncIterator]
) {
  ReadableStream.prototype[Symbol.asyncIterator] = function () {
    const reader = this.getReader();
    return {
      async next() {
        return reader.read();
      },
      async return() {
        reader.releaseLock();
        return { done: true };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
}
