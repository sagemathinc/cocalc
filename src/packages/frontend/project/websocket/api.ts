/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
API for direct connection to a project; implemented using the websocket.
*/

import { redux } from "@cocalc/frontend/app-framework";
import { RunNotebookOptions } from "@cocalc/frontend/jupyter/nbgrader/api";
import {
  Capabilities,
  Configuration,
  ConfigurationAspect,
  isMainConfiguration,
  ProjectConfiguration,
} from "@cocalc/frontend/project_configuration";
import type {
  Config as FormatterConfig,
  Options as FormatterOptions,
  FormatResult,
} from "@cocalc/util/code-formatter";
import { syntax2tool } from "@cocalc/util/code-formatter";
import { DirectoryListingEntry } from "@cocalc/util/types";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type {
  Channel,
  Mesg,
  NbconvertParams,
} from "@cocalc/comm/websocket/types";
import call from "@cocalc/sync/client/call";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type ProjectApi } from "@cocalc/nats/project-api";
import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";
import { formatterClient } from "@cocalc/nats/service/formatter";
import { syncFsClient } from "@cocalc/nats/service/syncfs-client";

export class API {
  private conn;
  private project_id: string;
  private cachedVersion?: number;
  private apiCache: { [key: string]: ProjectApi } = {};

  constructor(conn, project_id: string) {
    this.conn = conn;
    this.project_id = project_id;
    this.listing = reuseInFlight(this.listing.bind(this));
    this.conn.on("end", () => {
      delete this.cachedVersion;
    });
  }

  private getApi = ({
    compute_server_id,
    timeout = 15000,
  }: {
    compute_server_id?: number;
    timeout?: number;
  }) => {
    if (compute_server_id == null) {
      compute_server_id =
        redux.getProjectActions(this.project_id).getComputeServerId() ?? 0;
    }
    const key = `${compute_server_id}-${timeout}`;
    if (this.apiCache[key] == null) {
      this.apiCache[key] = webapp_client.nats_client.projectApi({
        project_id: this.project_id,
        compute_server_id,
        timeout,
      });
    }
    return this.apiCache[key]!;
  };

  private primusCall = async (mesg: Mesg, timeout: number) => {
    return await call(this.conn, mesg, timeout);
  };

  private _call = async (mesg: Mesg, timeout: number): Promise<any> => {
    return await webapp_client.nats_client.projectWebsocketApi({
      project_id: this.project_id,
      mesg,
      timeout,
    });
  };

  private getChannel = async (channel_name: string) => {
    const natsConn = await webapp_client.nats_client.primus(this.project_id);
    // TODO -- typing
    return natsConn.channel(channel_name) as unknown as Channel;
  };

  call = async (mesg: Mesg, timeout: number) => {
    try {
      return await this._call(mesg, timeout);
    } catch (err) {
      if (err.code == "PERMISSIONS_VIOLATION") {
        // request update of our credentials to include this project, then try again
        await webapp_client.nats_client.addProjectPermissions([
          this.project_id,
        ]);
        return await this._call(mesg, timeout);
      } else {
        throw err;
      }
    }
  };

  getComputeServerId = (path: string) => {
    return redux
      .getProjectActions(this.project_id)
      .getComputeServerIdForFile({ path });
  };

  version = async (compute_server_id?: number): Promise<number> => {
    const api = this.getApi({ compute_server_id });
    return await api.system.version();
  };

  delete_files = async (
    paths: string[],
    compute_server_id?: number,
  ): Promise<void> => {
    const api = this.getApi({ compute_server_id, timeout: 60000 });
    return await api.system.deleteFiles({ paths });
  };

  // Move the given paths to the dest.  The folder dest must exist
  // already and be a directory, or this is in an error.
  move_files = async (
    paths: string[],
    dest: string,
    compute_server_id?: number,
  ): Promise<void> => {
    const api = this.getApi({ compute_server_id, timeout: 60000 });
    return await api.system.moveFiles({ paths, dest });
  };

  // Rename the file src to be the file dest.  The dest may be
  // in a different directory or may even exist already (in which)
  // case it is overwritten if it is a file. If dest exists and
  // is a directory, it is an error.
  rename_file = async (
    src: string,
    dest: string,
    compute_server_id?: number,
  ): Promise<void> => {
    const api = this.getApi({ compute_server_id, timeout: 60000 });
    return await api.system.renameFile({ src, dest });
  };

  listing = async (
    path: string,
    hidden: boolean = false,
    timeout: number = 15000,
    compute_server_id: number = 0,
  ): Promise<DirectoryListingEntry[]> => {
    const api = this.getApi({ compute_server_id, timeout });
    return await api.system.listing({ path, hidden });
  };

  /* Normalize the given paths relative to the HOME directory.
     This takes any old weird looking mess of a path and makes
     it one that can be opened properly with our file editor,
     and the path appears to be to a file *in* the HOME directory.
  */
  canonical_path = async (
    path: string,
    compute_server_id?: number,
  ): Promise<string> => {
    const v = await this.canonical_paths([path], compute_server_id);
    const x = v[0];
    if (typeof x != "string") {
      throw Error("bug in canonical_path");
    }
    return x;
  };
  canonical_paths = async (
    paths: string[],
    compute_server_id?: number,
  ): Promise<string[]> => {
    const api = this.getApi({ compute_server_id });
    return await api.system.canonicalPaths(paths);
  };

  configuration = async (
    aspect: ConfigurationAspect,
    no_cache = false,
    compute_server_id?: number,
  ): Promise<Configuration> => {
    const api = this.getApi({ compute_server_id });
    return await api.system.configuration(aspect, no_cache);
  };

  private homeDirectory: { [key: string]: string } = {};
  getHomeDirectory = async (compute_server_id?: number) => {
    if (compute_server_id == null) {
      compute_server_id =
        redux.getProjectActions(this.project_id).getComputeServerId() ?? 0;
    }
    const key = `${compute_server_id}`;
    if (this.homeDirectory[key] == null) {
      const { capabilities } = await this.configuration(
        "main",
        false,
        compute_server_id,
      );
      this.homeDirectory[key] = capabilities.homeDirectory as string;
    }
    return this.homeDirectory[key]!;
  };

  // use the returned FormatterOptions for the API formatting call!
  private check_formatter_available = (
    config: FormatterConfig,
  ): FormatterOptions => {
    const formatting = this.get_formatting();
    if (formatting == null) {
      throw new Error(
        "Code formatting status not available. Please restart your project!",
      );
    }
    // TODO refactor the assocated formatter and smc-project into a common configuration object
    const tool = syntax2tool[config.syntax];
    if (tool == null) {
      throw new Error(`No known tool for '${config.syntax}' available`);
    }
    if (formatting[tool] !== true) {
      throw new Error(
        `For this project, the code formatter '${tool}' for language '${config.syntax}' is not available.`,
      );
    }
    return { parser: tool, lastChanged: config.lastChanged };
  };

  get_formatting = (): Capabilities | undefined => {
    const project_store = redux.getProjectStore(this.project_id) as any;
    const configuration = project_store.get(
      "configuration",
    ) as ProjectConfiguration;
    // configuration check only for backwards compatibility, i.e. newer clients and old projects
    if (configuration == null) {
      return;
    }
    const main = configuration.get("main");
    if (main != null && isMainConfiguration(main)) {
      return main.capabilities.formatting;
    } else {
      return {} as Capabilities;
    }
  };

  // Returns  { status: "ok", patch:... the patch} or
  // { status: "error", phase: "format", error: err.message }.
  // We return a patch rather than the entire file, since often
  // the file is very large, but the formatting is tiny.  This is purely
  // a data compression technique.
  formatter = async (
    path: string,
    config: FormatterConfig,
    compute_server_id?: number,
  ): Promise<FormatResult> => {
    const options: FormatterOptions = this.check_formatter_available(config);
    const client = formatterClient({
      project_id: this.project_id,
      compute_server_id: compute_server_id ?? this.getComputeServerId(path),
    });
    return await client.formatter({ path, options });
  };

  formatter_string = async (
    str: string,
    config: FormatterConfig,
    timeout: number = 15000,
    compute_server_id?: number,
  ): Promise<any> => {
    const options: FormatterOptions = this.check_formatter_available(config);
    const api = this.getApi({ compute_server_id, timeout });
    return await api.editor.formatterString({ str, options });
  };

  exec = async (opts: ExecuteCodeOptions): Promise<ExecuteCodeOutput> => {
    let timeout_ms = 10000;
    if (opts.timeout) {
      // its in seconds :-(
      timeout_ms = opts.timeout * 1000 + 2000;
    }
    // we explicitly remove compute_server_id since we don't need
    // to pass that to opts, since exec is not proxied anymore through the project.
    const { compute_server_id, ...options } = opts;
    const api = this.getApi({
      compute_server_id,
      timeout: timeout_ms,
    });
    return await api.system.exec(options);
  };

  realpath = async (
    path: string,
    compute_server_id?: number,
  ): Promise<string> => {
    const api = this.getApi({
      compute_server_id: compute_server_id ?? this.getComputeServerId(path),
    });
    return await api.system.realpath(path);
  };

  // Convert a notebook to some other format.
  // --to options are listed in packages/frontend/jupyter/nbconvert.tsx
  // and implemented in packages/project/jupyter/convert/index.ts
  jupyter_nbconvert = async (
    opts: NbconvertParams,
    compute_server_id?: number,
  ): Promise<any> => {
    const api = this.getApi({
      compute_server_id:
        compute_server_id ?? this.getComputeServerId(opts.args[0]),
      timeout: (opts.timeout ?? 60) * 1000 + 5000,
    });
    return await api.editor.jupyterNbconvert(opts);
  };

  // Get contents of an ipynb file, but with output and attachments removed (to save space)
  jupyter_strip_notebook = async (
    ipynb_path: string,
    compute_server_id?: number,
  ): Promise<any> => {
    const api = this.getApi({
      compute_server_id:
        compute_server_id ?? this.getComputeServerId(ipynb_path),
    });
    return await api.editor.jupyterStripNotebook(ipynb_path);
  };

  // Run the notebook filling in the output of all cells, then return the
  // result as a string.  Note that the output size (per cell and total)
  // and run time is bounded to avoid the output being HUGE, even if the
  // input is dumb.

  jupyter_run_notebook = async (
    opts: RunNotebookOptions,
    compute_server_id?: number,
  ): Promise<string> => {
    const max_total_time_ms = opts.limits?.max_total_time_ms ?? 20 * 60 * 1000;
    // a bit of extra time -- it's better to let the internal project
    // timer do the job, than have to wait for this generic timeout here,
    // since we want to at least get output for problems that ran.
    const api = this.getApi({
      compute_server_id:
        compute_server_id ?? this.getComputeServerId(opts.path),
      timeout: 60 + 2 * max_total_time_ms,
    });
    return await api.editor.jupyterRunNotebook(opts);
  };

  // TODO!
  terminal = async (path: string, options: object = {}): Promise<Channel> => {
    const channel_name = await this.call(
      {
        cmd: "terminal",
        path,
        options,
      },
      20000,
    );
    return await this.getChannel(channel_name);
  };

  project_info = async (): Promise<Channel> => {
    const channel_name = await this.call({ cmd: "project_info" }, 60000);
    return await this.getChannel(channel_name);
  };

  // Get the lean *channel* for the given '.lean' path.
  lean_channel = async (path: string): Promise<Channel> => {
    const channel_name = await this.primusCall(
      {
        cmd: "lean_channel",
        path: path,
      },
      60000,
    );
    return this.conn.channel(channel_name);
  };

  // Get the x11 *channel* for the given '.x11' path.
  x11_channel = async (path: string, display: number): Promise<Channel> => {
    const channel_name = await this.primusCall(
      {
        cmd: "x11_channel",
        path,
        display,
      },
      60000,
    );
    return this.conn.channel(channel_name);
  };

  // Get the sync *channel* for the given SyncTable project query.
  synctable_channel = async (
    query: { [field: string]: any },
    options: { [field: string]: any }[],
  ): Promise<Channel> => {
    const channel_name = await this.primusCall(
      {
        cmd: "synctable_channel",
        query,
        options,
      },
      10000,
    );
    // console.log("synctable_channel", query, options, channel_name);
    return this.conn.channel(channel_name);
  };

  // Command-response API for synctables.
  //   - mesg = {cmd:'close'} -- closes the synctable, even if persistent.
  syncdoc_call = async (
    path: string,
    mesg: { [field: string]: any },
    timeout_ms: number = 30000, // ms timeout for call
  ): Promise<any> => {
    return await this.call({ cmd: "syncdoc_call", path, mesg }, timeout_ms);
  };

  // Do a request/response command to the lean server.
  lean = async (opts: any): Promise<any> => {
    let timeout_ms = 10000;
    if (opts.timeout) {
      timeout_ms = opts.timeout * 1000 + 2000;
    }
    return await this.call({ cmd: "lean", opts }, timeout_ms);
  };

  // I think this isn't used.  It was going to support
  // sync_channel, but obviously a more nuanced protocol
  // was required.
  symmetric_channel = async (name: string): Promise<Channel> => {
    const channel_name = await this.primusCall(
      {
        cmd: "symmetric_channel",
        name,
      },
      30000,
    );
    return this.conn.channel(channel_name);
  };

  computeServerSyncRequest = async (compute_server_id: number) => {
    console.log("doing sync request");
    const client = syncFsClient({
      project_id: this.project_id,
      compute_server_id,
    });
    return await client.sync();
  };

  copyFromProjectToComputeServer = async (opts: {
    compute_server_id: number;
    paths: string[];
    dest?: string;
    timeout?: number;
  }) => {
    await this.call(
      { cmd: "copy_from_project_to_compute_server", opts },
      (opts.timeout ?? 60) * 1000,
    );
  };

  copyFromComputeServerToProject = async ({
    compute_server_id,
    paths,
    dest,
    timeout = 60,
  }: {
    compute_server_id: number;
    paths: string[];
    dest?: string;
    timeout?: number;
  }) => {
    const client = syncFsClient({
      project_id: this.project_id,
      compute_server_id,
      timeout,
    });
    return await client.copyFiles({ paths, dest });
  };
}
