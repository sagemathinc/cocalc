import { EventEmitter } from "events";
import { SyncTable } from "./synctable";
import { bind_methods, once } from "../../async-utils";
import { keys } from "../../misc2";

/* Basic Client class that we use for testing. */
class ClientTest extends EventEmitter {
  private initial_get_query: any[];

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
      opts.cb();
    } else {
      // get query -- returns predetermined result (default: empty)
      const table = keys(opts.query)[0];
      opts.cb(undefined, { query: { [table]: this.initial_get_query } });
    }
  }

  public query_cancel(_): void {}

  public alert_message(_): void {}
}

describe("creates a system_notifications SyncTable", () => {
  let synctable: SyncTable;
  test("create the synctable", async () => {
    const client = new ClientTest([
      {
        id: "123e4567-e89b-12d3-a456-426655440000",
        time: new Date(),
        text: "This is a message.",
        priority: "low",
        done: false
      }
    ]);
    synctable = new SyncTable("system_notifications", [], client);
    await once(synctable, "connected");
  });
});
