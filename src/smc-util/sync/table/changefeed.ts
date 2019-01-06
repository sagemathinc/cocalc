import { EventEmitter } from "events";

import { callback } from "awaiting";

type State = "closed" | "disconnected" | "connecting" | "connected";

export class Changefeed extends EventEmitter {
  private query: any;
  private do_query: Function;
  private query_cancel: Function;
  private state: State = "disconnected";
  private table: string;
  private id: string;
  private options: any;

  constructor({
    do_query,
    query_cancel,
    options,
    query,
    table
  }: {
    do_query: Function;
    query_cancel: Function;
    options: any;
    table: string;
    query: any;
  }) {
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
  public async connect(): Promise<any> {
    if (this.state != "disconnected") {
      throw Error(
        `can only connect if state is 'disconnected' but it is ${this.state}`
      );
    }
    this.state = "connecting";
    const resp = await callback(this.run_the_query.bind(this));
    if (this.state === ("closed" as State)) {
      throw Error("after running query, changefeed state is 'closed'");
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
        f = this.handle_update.bind(this);
      }
    });
  }

  private handle_update(err, resp): void {
    if (this.state != "connected") {
      if (this.state == "closed") {
        // expected, since last updates after query cancel may get through...
        return;
      }
      //console.warn("handle_update", this.table, this.query, err, resp);
      throw Error(
        `changefeed bug -- handle_update called when state "${this.state}"`
      );
    }
    if (resp == null && err == null) {
      err = "resp must not be null for non-error";
    }
    if (err || resp.event === "query_cancel") {
      //if (err) console.warn("closing changefeed due to err", err);
      this.close();
      return;
    }
    // Return just the new_val/old_val part of resp.
    const x: { new_val?: any; old_val?: any } = {};
    if (resp.new_val) {
      x.new_val = resp.new_val;
    }
    if (resp.old_val) {
      x.new_val = resp.old_val;
    }
    this.emit("update", x);
  }

  public close(): void {
    this.state = "closed";
    if (this.id != null) {
      // stop listening for future updates
      this.query_cancel({ id: this.id });
      delete this.id;
    }
    this.emit("close");
    this.removeAllListeners();
  }

  public get_state(): string {
    return this.state;
  }
}

//
