import { EventEmitter } from "events";

import { callback } from "awaiting";

export class Changefeed extends EventEmitter {
  private query: any;
  private do_query : Function;
  private query_function: Function;
  private query_cancel: Function;
  private state: string = "new";
  private table: string;
  private id: string;
  private options: any;

  constructor({ do_query, query_cancel, options, query, table }) {
    super();
    this.do_query = do_query;
    this.query_cancel = query_cancel;
    this.query = query;
    this.options = options;
    this.table = table;
  }

  // Query for state of the table, connects to the
  // changefeed, and return the initial state
  // of the table.  Throws an exception if anything
  // goes wrong.
  async init(): Promise<any> {
    const resp = await callback(this.run_the_query);
    if (this.state === "closed") {
      throw Error("closed");
    }
    if (resp.event === "query_cancel") {
      throw Error("query-cancel");
    }
    if (resp.query == null || resp.query[this.table] == null) {
      throw Error("got no data");
    }
    // Successfully completed query
    this.id = resp.id;
    this.state = "connected";
    return resp.query[this.table];
  }

  private run_the_query(cb: Function): void {
    // This query_function gets called first on the
    // initial query, then repeatedly with each changefeed
    // update. The input function "cb" will be called
    // precisely once, and the method handle_changefeed_update
    // may get called if there are additional
    // changefeed updaes.
    let f = cb;
    this.do_query({
      query: this.query,
      changes: true,
      timeout: 30,
      options: this.options,
      cb: (err, resp) => {
        // This calls cb the first time, and  calls
        // handle_changefeed_update ever after.
        f(err, resp);
        f = this.handle_update;
      }
    });
  }

  private handle_update(err, resp) {
    if (this.state !== "connected") {
      this.close();
      return;
    }
    if (err || (resp != null && resp.event === "query_cancel")) {
      this.close();
      return;
    }
    this.emit("update", { new_val: resp.new_val, old_val: resp.old_val });
  }

  public close(): void {
    this.state = "closed";
    // todo
    if (this.id != null) {
      // ignore this update, and stop listening for future ones
      this.query_cancel({ id: this.id });
      delete this.id;
    }
  }
}

//
