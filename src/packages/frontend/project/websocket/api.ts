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
} from "@cocalc/util/code-formatter";
import { syntax2tool } from "@cocalc/util/code-formatter";
import { DirectoryListingEntry } from "@cocalc/util/types";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type {
  Channel,
  Mesg,
  NbconvertParams,
} from "@cocalc/comm/websocket/types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type ProjectApi } from "@cocalc/conat/project/api";
import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";
import { syncFsClientClient } from "@cocalc/conat/service/syncfs-client";

const log = (...args) => {
  console.log("project:websocket: ", ...args);
};

export class API {
  private project_id: string;
  private apiCache: { [key: string]: ProjectApi } = {};

  constructor(project_id: string) {
    this.project_id = project_id;
    this.listing = reuseInFlight(this.listing.bind(this));
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
      this.apiCache[key] = webapp_client.conat_client.projectApi({
        project_id: this.project_id,
        compute_server_id,
        timeout,
      });
    }
    return this.apiCache[key]!;
  };

  private _call = async (
    mesg: Mesg,
    timeout: number,
    compute_server_id = 0,
  ): Promise<any> => {
    log("_call (NEW conat call)", mesg);
    const resp = await webapp_client.conat_client.projectWebsocketApi({
      project_id: this.project_id,
      compute_server_id,
      mesg,
      timeout,
    });
    log("_call worked and returned", resp);
    return resp;
  };

  private getChannel = (
    channel: string,
    compute_server_id?: number,
  ): Channel => {
    return webapp_client.conat_client.primus({
      project_id: this.project_id,
      compute_server_id,
      channel,
    }) as unknown as Channel;
  };

  call = async (mesg: Mesg, timeout: number) => {
    return await this._call(mesg, timeout);
  };

  getComputeServerId = (path: string) => {
    return redux
      .getProjectActions(this.project_id)
      .getComputeServerIdForFile({ path });
  };

  version = async (compute_server_id?: number): Promise<number> => {
    if (compute_server_id) {
      throw Error("version only implemented right now for home base");
    }
    compute_server_id = 0;
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
    if (compute_server_id == null) {
      // TODO: this is home base configuration for now by default no matter what is
      // selected in the explorer.  Someday it might be for compute servers,
      // but right now that info is just not used/known elsewhere in our code. So by
      // default use home base!
      compute_server_id = 0;
    }
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

  formatter_string = async (
    str: string,
    config: FormatterConfig,
    timeout: number = 15000,
    compute_server_id?: number,
  ): Promise<string> => {
    const options: FormatterOptions = this.check_formatter_available(config);
    const api = this.getApi({ compute_server_id, timeout });
    return await api.editor.formatString({ str, options });
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
      compute_server_id,
      timeout: 60 + 2 * max_total_time_ms,
    });
    return await api.editor.jupyterRunNotebook(opts);
  };

  // Get the x11 *channel* for the given '.x11' path.
  x11_channel = async (path: string, display: number): Promise<Channel> => {
    const channel_name = await this._call(
      {
        cmd: "x11_channel",
        path,
        display,
      },
      60000,
    );
    log("x11_channel");
    return this.getChannel(channel_name);
  };

  // Copying files to/from compute servers:

  computeServerSyncRequest = async (compute_server_id: number) => {
    const client = syncFsClientClient({
      project_id: this.project_id,
      compute_server_id,
    });
    return await client.sync();
  };

  copyFromHomeBaseToComputeServer = async ({
    paths,
    dest,
    compute_server_id,
    timeout = 60 * 1000,
  }: {
    compute_server_id: number;
    paths: string[];
    dest?: string;
    timeout?: number;
  }) => {
    const client = syncFsClientClient({
      project_id: this.project_id,
      compute_server_id,
      timeout,
    });
    return await client.copyFilesFromHomeBase({ paths, dest });
  };

  copyFromComputeServerToHomeBase = async ({
    compute_server_id,
    paths,
    dest,
    timeout = 60 * 1000,
  }: {
    compute_server_id: number;
    paths: string[];
    dest?: string;
    timeout?: number;
  }) => {
    const client = syncFsClientClient({
      project_id: this.project_id,
      compute_server_id,
      timeout,
    });
    return await client.copyFilesToHomeBase({ paths, dest });
  };
}
