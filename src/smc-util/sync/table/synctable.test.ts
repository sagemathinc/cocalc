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
  const notifications = [
    {
      id: "123e4567-e89b-12d3-a456-426655440000",
      time: new Date(),
      text: "This is a message.",
      priority: "low",
      done: false
    },
    {
      id: "123e4567-e89b-12d3-a456-426655440001",
      time: new Date(),
      text: "This is a second message.",
      priority: "high",
      done: false
    }
  ];
  test("create the synctable", async () => {
    const client = new ClientTest(notifications);
    synctable = new SyncTable("system_notifications", [], client);
    await once(synctable, "connected");
  });

  test("get query the synctable", () => {
    const x = synctable.get();
    if (x == null) {
      throw Error("must be defined since synctable is connected");
    }
    expect(x.toJS()).toEqual({
      [notifications[0].id]: notifications[0],
      [notifications[1].id]: notifications[1]
    });
  });

  test("get_one query the synctable", () => {
    const x = synctable.get_one();
    if (x == null) {
      throw Error("must be defined since synctable is connected");
    }
    expect(x.toJS()).toEqual(notifications[0]);
  });
});
