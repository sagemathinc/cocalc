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
const COMPUTE_SERVER_REMOVED_MESSAGE =
  "Compute servers have been removed from CoCalc.";

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

  private getApi = ({ timeout = 15000 }: { timeout?: number } = {}) => {
    const key = `${timeout}`;
    if (this.apiCache[key] == null) {
      this.apiCache[key] = webapp_client.conat_client.projectApi({
        project_id: this.project_id,
        timeout,
      });
    }
    return this.apiCache[key]!;
  };

  private _call = async (mesg: Mesg, timeout: number): Promise<any> => {
    log("_call (NEW conat call)", mesg);
    const resp = await webapp_client.conat_client.projectWebsocketApi({
      project_id: this.project_id,
      mesg,
      timeout,
    });
    log("_call worked and returned", resp);
    return resp;
  };

  private getChannel = (channel: string): Channel => {
    return webapp_client.conat_client.primus({
      project_id: this.project_id,
      channel,
    }) as unknown as Channel;
  };

  call = async (mesg: Mesg, timeout: number) => {
    return await this._call(mesg, timeout);
  };

  version = async (): Promise<number> => {
    const api = this.getApi();
    return await api.system.version();
  };

  // Move the given paths to the dest.  The folder dest must exist
  // already and be a directory, or this is in an error.
  move_files = async (paths: string[], dest: string): Promise<void> => {
    const api = this.getApi({ timeout: 60000 });
    return await api.system.moveFiles({ paths, dest });
  };

  // Rename the file src to be the file dest.  The dest may be
  // in a different directory or may even exist already (in which)
  // case it is overwritten if it is a file. If dest exists and
  // is a directory, it is an error.
  rename_file = async (src: string, dest: string): Promise<void> => {
    const api = this.getApi({ timeout: 60000 });
    return await api.system.renameFile({ src, dest });
  };

  listing = async (
    path: string,
    hidden: boolean = false,
    timeout: number = 15000,
  ): Promise<DirectoryListingEntry[]> => {
    const api = this.getApi({ timeout });
    return await api.system.listing({ path, hidden });
  };

  /* Normalize the given paths relative to the HOME directory.
     This takes any old weird looking mess of a path and makes
     it one that can be opened properly with our file editor,
     and the path appears to be to a file *in* the HOME directory.
  */
  canonical_path = async (path: string): Promise<string> => {
    const v = await this.canonical_paths([path]);
    const x = v[0];
    if (typeof x != "string") {
      throw Error("bug in canonical_path");
    }
    return x;
  };
  canonical_paths = async (paths: string[]): Promise<string[]> => {
    const api = this.getApi();
    return await api.system.canonicalPaths(paths);
  };

  configuration = async (
    aspect: ConfigurationAspect,
    no_cache = false,
  ): Promise<Configuration> => {
    const api = this.getApi();
    return await api.system.configuration(aspect, no_cache);
  };

  private homeDirectory: { [key: string]: string } = {};
  getHomeDirectory = async () => {
    const key = "default";
    if (this.homeDirectory[key] == null) {
      const { capabilities } = await this.configuration("main", false);
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
    // TODO refactor the associated formatter and smc-project into a common configuration object
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
  ): Promise<string> => {
    const options: FormatterOptions = this.check_formatter_available(config);
    const api = this.getApi({ timeout });
    return await api.editor.formatString({ str, options });
  };

  exec = async (opts: ExecuteCodeOptions): Promise<ExecuteCodeOutput> => {
    let timeout_ms = 10000;
    if (opts.timeout) {
      // its in seconds :-(
      timeout_ms = opts.timeout * 1000 + 2000;
    }
    const api = this.getApi({
      timeout: timeout_ms,
    });
    return await api.system.exec(opts);
  };

  realpath = async (path: string): Promise<string> => {
    const api = this.getApi();
    return await api.system.realpath(path);
  };

  // Convert a notebook to some other format.
  // --to options are listed in packages/frontend/jupyter/nbconvert.tsx
  // and implemented in packages/project/jupyter/convert/index.ts
  jupyter_nbconvert = async (
    opts: NbconvertParams,
  ): Promise<any> => {
    const api = this.getApi({
      timeout: (opts.timeout ?? 60) * 1000 + 5000,
    });
    return await api.jupyter.nbconvert(opts);
  };

  // Get contents of an ipynb file, but with output and attachments removed (to save space)
  jupyter_strip_notebook = async (
    ipynb_path: string,
  ): Promise<any> => {
    const api = this.getApi();
    return await api.jupyter.stripNotebook(ipynb_path);
  };

  // Run the notebook filling in the output of all cells, then return the
  // result as a string.  Note that the output size (per cell and total)
  // and run time is bounded to avoid the output being HUGE, even if the
  // input is dumb.

  jupyter_run_notebook = async (
    opts: RunNotebookOptions,
  ): Promise<string> => {
    const max_total_time_ms = opts.limits?.max_total_time_ms ?? 20 * 60 * 1000;
    // a bit of extra time -- it's better to let the internal project
    // timer do the job, than have to wait for this generic timeout here,
    // since we want to at least get output for problems that ran.
    const api = this.getApi({
      timeout: 60 + 2 * max_total_time_ms,
    });
    return await api.jupyter.runNotebook(opts);
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

  computeServerSyncRequest = async (_computeServerId: number) => {
    void _computeServerId;
    throw new Error(COMPUTE_SERVER_REMOVED_MESSAGE);
  };

  copyFromHomeBaseToComputeServer = async (_opts: {
    id: number;
    paths: string[];
    dest?: string;
    timeout?: number;
  }) => {
    void _opts;
    throw new Error(COMPUTE_SERVER_REMOVED_MESSAGE);
  };

  copyFromComputeServerToHomeBase = async (_opts: {
    id: number;
    paths: string[];
    dest?: string;
    timeout?: number;
  }) => {
    void _opts;
    throw new Error(COMPUTE_SERVER_REMOVED_MESSAGE);
  };
}
