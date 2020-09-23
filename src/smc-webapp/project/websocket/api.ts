/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
API for direct connection to a project; implemented using the websocket.
*/

import { callback } from "awaiting";
import { Channel } from "./types";
import {
  ConfigurationAspect,
  Capabilities,
  Configuration,
  ProjectConfiguration,
  isMainConfiguration,
} from "../../project_configuration";
import { redux } from "../../app-framework";
import { syntax2tool } from "smc-util/code-formatter";
import {
  Options as FormatterOptions,
  Config as FormatterConfig,
} from "smc-project/formatters/prettier";
import {
  NBGraderAPIOptions,
  RunNotebookOptions,
} from "../../jupyter/nbgrader/api";
import { DirectoryListingEntry } from "smc-util/types";

import { reuseInFlight } from "async-await-utils/hof";

export class API {
  private conn: any;
  private project_id: string;

  constructor(conn: string, project_id: string) {
    this.conn = conn;
    this.project_id = project_id;
    this.listing = reuseInFlight(this.listing.bind(this));
  }

  async call(mesg: object, timeout_ms: number): Promise<any> {
    const resp = await callback(call, this.conn, mesg, timeout_ms);
    if (resp != null && resp.status === "error") {
      throw Error(resp.error);
    }
    return resp;
  }

  async delete_files(paths: string[]): Promise<void> {
    return await this.call({ cmd: "delete_files", paths }, 60000);
  }

  // Move the given paths to the dest.  The folder dest must exist
  // already and be a directory, or this is in an error.
  async move_files(paths: string[], dest: string): Promise<void> {
    return await this.call({ cmd: "move_files", paths, dest }, 60000);
  }

  // Rename the file src to be the file dest.  The dest may be
  // in a different directory or may even exist already (in which)
  // case it is overwritten if it is a file. If dest exists and
  // is a directory, it is an error.
  async rename_file(src: string, dest: string): Promise<void> {
    return await this.call({ cmd: "rename_file", src, dest }, 30000);
  }

  async listing(
    path: string,
    hidden: boolean = false,
    timeout: number = 15000
  ): Promise<DirectoryListingEntry[]> {
    return await this.call({ cmd: "listing", path, hidden }, timeout);
  }

  /* Normalize the given paths relative to the HOME directory.
     This takes any old weird looking mess of a path and makes
     it one that can be opened properly with our file editor,
     and the path appears to be to a file *in* the HOME directory.
  */
  async canonical_path(path: string): Promise<string> {
    const v = await this.canonical_paths([path]);
    const x = v[0];
    if (typeof x != "string") {
      throw Error("bug in canonical_path");
    }
    return x;
  }
  async canonical_paths(paths: string[]): Promise<string[]> {
    return await this.call({ cmd: "canonical_paths", paths }, 15000);
  }

  async configuration(
    aspect: ConfigurationAspect,
    no_cache = false
  ): Promise<Configuration> {
    return await this.call({ cmd: "configuration", aspect, no_cache }, 15000);
  }

  // use the returned FormatterOptions for the API formatting call!
  private check_formatter_available(config: FormatterConfig): FormatterOptions {
    const formatting = this.get_formatting();
    if (formatting == null) {
      throw new Error(
        "Code formatting status not available. Please restart your project!"
      );
    }
    // TODO refactor the assocated formatter and smc-project into a common configuration object
    const tool = syntax2tool[config.syntax];
    if (tool == null) {
      throw new Error(`No known tool for '${config.syntax}' available`);
    }
    if (formatting[tool] !== true) {
      throw new Error(
        `For this project, the code formatter '${tool}' for language '${config.syntax}' is not available.`
      );
    }
    return { parser: tool };
  }

  get_formatting(): Capabilities | undefined {
    const project_store = redux.getProjectStore(this.project_id) as any;
    const configuration = project_store.get(
      "configuration"
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
  }

  // Returns  { status: "ok", patch:... the patch} or
  // { status: "error", phase: "format", error: err.message }.
  // We return a patch rather than the entire file, since often
  // the file is very large, but the formatting is tiny.  This is purely
  // a data compression technique.
  async prettier(path: string, config: FormatterConfig): Promise<any> {
    const options: FormatterOptions = this.check_formatter_available(config);
    return await this.call({ cmd: "prettier", path: path, options }, 15000);
  }

  async prettier_string(str: string, config: FormatterConfig): Promise<any> {
    const options: FormatterOptions = this.check_formatter_available(config);
    return await this.call(
      {
        cmd: "prettier_string",
        str: str,
        options,
      },
      15000
    );
  }

  async jupyter(
    path: string,
    endpoint: string,
    query: any = undefined,
    timeout_ms: number = 20000
  ): Promise<any> {
    return await this.call(
      { cmd: "jupyter", path, endpoint, query },
      timeout_ms
    );
  }

  async exec(opts: any): Promise<any> {
    let timeout_ms = 10000;
    if (opts.timeout) {
      timeout_ms = opts.timeout * 1000 + 2000;
    }
    return await this.call({ cmd: "exec", opts }, timeout_ms);
  }

  async eval_code(code: string, timeout_ms: number = 20000): Promise<any> {
    return await this.call({ cmd: "eval_code", code }, timeout_ms);
  }

  async realpath(path: string): Promise<string> {
    return await this.call({ cmd: "realpath", path }, 15000);
  }

  async terminal(path: string, options: object = {}): Promise<Channel> {
    const channel_name = await this.call(
      {
        cmd: "terminal",
        path: path,
        options,
      },
      60000
    );
    //console.log(path, "got terminal channel", channel_name);
    return this.conn.channel(channel_name);
  }

  async project_info(): Promise<Channel> {
    const channel_name = await this.call({ cmd: "project_info" }, 60000);
    return this.conn.channel(channel_name);
  }

  // Get the lean *channel* for the given '.lean' path.
  async lean_channel(path: string): Promise<Channel> {
    const channel_name = await this.call(
      {
        cmd: "lean_channel",
        path: path,
      },
      60000
    );
    return this.conn.channel(channel_name);
  }

  // Get the x11 *channel* for the given '.x11' path.
  async x11_channel(path: string, display: number): Promise<Channel> {
    const channel_name = await this.call(
      {
        cmd: "x11_channel",
        path,
        display,
      },
      60000
    );
    return this.conn.channel(channel_name);
  }

  // Get the sync *channel* for the given SyncTable project query.
  async synctable_channel(
    query: { [field: string]: any },
    options: { [field: string]: any }[]
  ): Promise<Channel> {
    const channel_name = await this.call(
      {
        cmd: "synctable_channel",
        query,
        options,
      },
      10000
    );
    // console.log("synctable_channel", query, options, channel_name);
    return this.conn.channel(channel_name);
  }

  // Command-response API for synctables.
  //   - mesg = {cmd:'close'} -- closes the synctable, even if persistent.
  async syncdoc_call(
    path: string,
    mesg: { [field: string]: any },
    timeout_ms: number = 30000 // ms timeout for call
  ): Promise<any> {
    return await this.call({ cmd: "syncdoc_call", path, mesg }, timeout_ms);
  }

  // Do a request/response command to the lean server.
  async lean(opts: any): Promise<any> {
    let timeout_ms = 10000;
    if (opts.timeout) {
      timeout_ms = opts.timeout * 1000 + 2000;
    }
    return await this.call({ cmd: "lean", opts }, timeout_ms);
  }

  // Use the nbgrader "protocol" to autograde a notebook
  async nbgrader(opts: NBGraderAPIOptions): Promise<any> {
    return await this.call({ cmd: "nbgrader", opts }, opts.timeout_ms + 5000);
  }

  // Get contents of an ipynb file, but with output and attachments removed (to save space)
  async jupyter_strip_notebook(ipynb_path: string): Promise<any> {
    return await this.call(
      { cmd: "jupyter_strip_notebook", ipynb_path },
      15000
    );
  }

  // Run the notebook filling in the output of all cells, then return the
  // result as a string.  Note that the output size (per cell and total)
  // and run time is bounded to avoid the output being HUGE, even if the
  // input is dumb.

  async jupyter_run_notebook(opts: RunNotebookOptions): Promise<string> {
    const max_total_time_ms = opts.limits?.max_total_time_ms ?? 20 * 60 * 1000;
    return await this.call(
      { cmd: "jupyter_run_notebook", opts },
      max_total_time_ms
    );
  }

  // I think this isn't used.  It was going to support
  // sync_channel, but obviously a more nuanced protocol
  // was required.
  async symmetric_channel(name: string): Promise<Channel> {
    const channel_name = await this.call(
      {
        cmd: "symmetric_channel",
        name,
      },
      30000
    );
    return this.conn.channel(channel_name);
  }
}

function call(conn: any, mesg: object, timeout_ms: number, cb: Function): void {
  let done: boolean = false;
  let timer: any = 0;
  if (timeout_ms) {
    timer = setTimeout(function () {
      if (done) return;
      done = true;
      cb("timeout");
    }, timeout_ms);
  }

  const t = new Date().valueOf();
  conn.writeAndWait(mesg, function (resp) {
    if (conn.verbose) {
      console.log(`call finished ${new Date().valueOf() - t}ms`, mesg, resp);
    }
    if (done) {
      return;
    }
    done = true;
    if (timer) {
      clearTimeout(timer);
    }
    cb(undefined, resp);
  });
}
