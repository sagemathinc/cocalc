import { callback } from "awaiting";

export class API {
  private conn: any;

  constructor(conn: string) {
    this.conn = conn;
  }

  async call(mesg: object, timeout_ms?: number): Promise<any> {
    if (timeout_ms === undefined) {
      timeout_ms = 30000;
    }
    return await callback(call, this.conn, mesg, timeout_ms);
  }

  async listing(path: string, hidden?: boolean): Promise<object[]> {
    return await this.call({ cmd: "listing", path: path, hidden: hidden });
  }

  async prettier(path: string, options: any): Promise<any> {
    return await this.call({ cmd: "prettier", path: path, options: options });
  }

  async jupyter(path: string, action: string, query: any) : Promise<any> {
    return await this.call({ cmd: "jupyter", path:path, action:action, query:query });
  }
}

function call(conn: any, mesg: object, timeout_ms: number, cb: Function): void {
  let done: boolean = false;
  let timer = setTimeout(function() {
    if (done) return;
    done = true;
    cb("timeout");
  }, timeout_ms);

  const t = new Date().valueOf();
  conn.writeAndWait(mesg, function(resp) {
    if (conn.verbose) {
      console.log(`call finished ${new Date().valueOf() - t}ms`, mesg);
    }
    if (done) {
      return;
    }
    done = true;
    clearTimeout(timer);
    cb(undefined, resp);
  });
}
