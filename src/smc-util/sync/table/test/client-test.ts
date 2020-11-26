/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Minimal client class that we use for testing.
*/

import { EventEmitter } from "events";
import { bind_methods, keys } from "../../../misc";

export class ClientTest extends EventEmitter {
  private initial_get_query: any[];
  public set_queries: any[] = [];

  constructor(initial_get_query) {
    super();

    this.initial_get_query = initial_get_query;
    bind_methods(this, ["query", "dbg", "query_cancel"]);
  }

  public is_project(): boolean {
    return false;
  }

  public is_connected(): boolean {
    return true;
  }

  public is_signed_in(): boolean {
    return true;
  }

  public dbg(_: string): Function {
    return console.log;
  }

  public query(opts): void {
    if (opts.options && opts.options.length === 1 && opts.options[0].set) {
      // set query
      this.set_queries.push(opts);
      opts.cb();
    } else {
      // get query -- returns predetermined result
      const table = keys(opts.query)[0];
      opts.cb(undefined, { query: { [table]: this.initial_get_query } });
    }
  }

  public query_cancel(_): void {}

  public alert_message(_): void {}

  public server_time(): Date {
    return new Date();
  }

  public touch_project(_): void {}
}
