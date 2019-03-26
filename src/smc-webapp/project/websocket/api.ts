/*
API for direct connection to a project; implemented using the websocket.
*/

import { callback } from "awaiting";
import { Channel } from "./types";
import {
  ConfigurationAspect,
  Capabilities,
  ProjectConfiguration,
  isMainConfiguration
} from "../../project_configuration";
import { redux } from "../../app-framework";
import { config as formatter_config } from "../../../smc-util/code-formatter";

export class API {
  private conn: any;
  private project_id: string;

  constructor(conn: string, project_id: string) {
    this.conn = conn;
    this.project_id = project_id;
  }

  async call(mesg: object, timeout_ms: number): Promise<any> {
    const resp = await callback(call, this.conn, mesg, timeout_ms);
    if (resp != null && resp.status === "error") {
      throw Error(resp.error);
    }
    return resp;
  }

  async listing(path: string, hidden?: boolean): Promise<object[]> {
    return await this.call(
      { cmd: "listing", path: path, hidden: hidden },
      15000
    );
  }

  async configuration(aspect: ConfigurationAspect): Promise<object[]> {
    return await this.call({ cmd: "configuration", aspect }, 15000);
  }

  async prettier(path: string, options: any): Promise<any> {
    return await this.call(
      { cmd: "prettier", path: path, options: options },
      15000
    );
  }

  get_formatting(): Capabilities {
    const project_store = redux.getProjectStore(this.project_id) as any;
    const configuration = project_store.get(
      "configuration"
    ) as ProjectConfiguration;
    const main = configuration.get("main");
    if (main != null && isMainConfiguration(main)) {
      return main.capabilities.formatting;
    } else {
      return {} as Capabilities;
    }
  }

  async prettier_string(str: string, options: any): Promise<any> {
    const formatting: Capabilities = this.get_formatting();
    // TODO refactor the assocated formatter and smc-project into a common configuration object
    const tool = formatter_config[options.parser];
    if (tool == null) {
      throw new Error(`No known tool for '${options.parser}' available`);
    }
    if (formatting[tool] !== true) {
      throw new Error(
        `In this project, code formatter '${tool}' for language '${
          options.parser
        }' is not available.`
      );
    }

    return await this.call(
      {
        cmd: "prettier_string",
        str: str,
        options: options
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

  async terminal(path: string, options: object = {}): Promise<Channel> {
    const channel_name = await this.call(
      {
        cmd: "terminal",
        path: path,
        options
      },
      60000
    );
    //console.log(path, "got terminal channel", channel_name);
    return this.conn.channel(channel_name);
  }

  // Get the lean *channel* for the given '.lean' path.
  async lean_channel(path: string): Promise<Channel> {
    const channel_name = await this.call(
      {
        cmd: "lean_channel",
        path: path
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
        display
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
        options
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

  // I think this isn't used.  It was going to support
  // sync_channel, but obviously a more nuanced protocol
  // was required.
  async symmetric_channel(name: string): Promise<Channel> {
    const channel_name = await this.call(
      {
        cmd: "symmetric_channel",
        name
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
    timer = setTimeout(function() {
      if (done) return;
      done = true;
      cb("timeout");
    }, timeout_ms);
  }

  const t = new Date().valueOf();
  conn.writeAndWait(mesg, function(resp) {
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
