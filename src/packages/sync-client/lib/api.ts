/*
This is the small lightweight subset of the project's websocket api that we
need for this compute package.  It's a subset of

packages/frontend/project/websocket/api.ts
*/

import type {
  API as API_Interface,
  Channel,
  ProjectWebsocket,
} from "@cocalc/sync/client/types";
import call from "@cocalc/sync/client/call";

export default class API implements API_Interface {
  private conn: ProjectWebsocket;
  private cachedVersion?: number;

  constructor(conn) {
    this.conn = conn;
  }

  async call(mesg: object, timeout_ms: number): Promise<any> {
    return await call(this.conn, mesg, timeout_ms);
  }

  async version(): Promise<number> {
    // version can never change, so its safe to cache
    if (this.cachedVersion != null) {
      return this.cachedVersion;
    }
    try {
      this.cachedVersion = await this.call({ cmd: "version" }, 15000);
    } catch (err) {
      if (err.message.includes('command "version" not implemented')) {
        this.cachedVersion = 0;
      } else {
        throw err;
      }
    }
    if (this.cachedVersion == null) {
      this.cachedVersion = 0;
    }
    return this.cachedVersion;
  }

  async listing(
    path: string,
    hidden: boolean = false,
    timeout: number = 15000,
  ) {
    return await this.call({ cmd: "listing", path, hidden }, timeout);
  }

  async configuration(aspect, no_cache = false) {
    return await this.call({ cmd: "configuration", aspect, no_cache }, 15000);
  }

  async jupyter(
    path: string,
    endpoint: string,
    query: any = undefined,
    timeout_ms: number = 20000,
  ) {
    return await this.call(
      { cmd: "jupyter", path, endpoint, query },
      timeout_ms,
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

  async terminal(path: string, options: object = {}): Promise<Channel> {
    const channel_name = await this.call(
      {
        cmd: "terminal",
        path: path,
        options,
      },
      60000,
    );
    return this.conn.channel(channel_name);
  }

  async project_info(): Promise<Channel> {
    const channel_name = await this.call({ cmd: "project_info" }, 60000);
    return this.conn.channel(channel_name);
  }

  async query(opts: any): Promise<any> {
    if (opts.timeout == null) {
      opts.timeout = 30000;
    }
    const timeout_ms = opts.timeout * 1000 + 2000;
    return await this.call({ cmd: "query", opts }, timeout_ms);
  }

  async compute_filesystem_cache(opts, timeout_ms = 30000) {
    return await this.call(
      { cmd: "compute_filesystem_cache", opts },
      timeout_ms,
    );
  }

  async syncFS(opts, timeout_ms = 1000 * 15 * 60) {
    return await this.call({ cmd: "sync_fs", opts }, timeout_ms);
  }

  async computeServerSyncRegister(compute_server_id) {
    return await this.call(
      { cmd: "compute_server_sync_register", opts: { compute_server_id } },
      15000,
    );
  }
  async computeServerComputeRegister(compute_server_id) {
    return await this.call(
      { cmd: "compute_server_compute_register", opts: { compute_server_id } },
      15000,
    );
  }
}
