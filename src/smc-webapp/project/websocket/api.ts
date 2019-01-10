/*
API for direct connection to a project; implemented using the websocket.
*/

import { callback } from "awaiting";

import { Channel } from "./types";

export class API {
  private conn: any;

  constructor(conn: string) {
    this.conn = conn;
  }

  async call(mesg: object, timeout_ms: number = 0): Promise<any> {
    const resp = await callback(call, this.conn, mesg, timeout_ms);
    if (resp != null && resp.status === "error") {
      throw Error(resp.error);
    }
    return resp;
  }

  async listing(path: string, hidden?: boolean): Promise<object[]> {
    return await this.call({ cmd: "listing", path: path, hidden: hidden });
  }

  async prettier(path: string, options: any): Promise<any> {
    return await this.call(
      { cmd: "prettier", path: path, options: options },
      15000
    );
  }

  async prettier_string(str: string, options: any): Promise<any> {
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
    const channel_name = await this.call({
      cmd: "terminal",
      path: path,
      options
    });
    //console.log(path, "got terminal channel", channel_name);
    return this.conn.channel(channel_name);
  }

  // Get the lean *channel* for the given '.lean' path.
  async lean_channel(path: string): Promise<Channel> {
    const channel_name = await this.call({
      cmd: "lean_channel",
      path: path
    });
    return this.conn.channel(channel_name);
  }

  // Get the x11 *channel* for the given '.x11' path.
  async x11_channel(path: string, display: number): Promise<Channel> {
    const channel_name = await this.call({
      cmd: "x11_channel",
      path,
      display
    });
    return this.conn.channel(channel_name);
  }

  // Get the sync *channel* for the given SyncTable project query.
  async synctable_channel(
    query: { [field: string]: any },
    options: { [field: string]: any }[]
  ): Promise<Channel> {
    const channel_name = await this.call({
      cmd: "synctable_channel",
      query,
      options
    }, 10000);
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

  async symmetric_channel(name: string): Promise<Channel> {
    const channel_name = await this.call({
      cmd: "symmetric_channel",
      name
    });
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
