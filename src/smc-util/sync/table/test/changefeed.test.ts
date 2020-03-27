import { Changefeed } from "../changefeed";

describe("first test of the public API of the Changefeed class", () => {
  const options = [];
  const query = {
    system_notifications: { id: null, time: null, text: null, priority: null },
  };
  const table = "system_notifications";

  const got: any = {};
  const init_val = [
    { id: "0", time: new Date(0), text: "foo", priority: "low" },
  ];
  function do_query(opts) {
    got.do_query = opts;
    opts.cb(undefined, { query: { [table]: init_val } });
  }
  function query_cancel(opts) {
    got.query_cancel = opts;
    opts.cb();
  }

  let changefeed: Changefeed;
  const opts = {
    do_query,
    query_cancel,
    options,
    query,
    table,
  };
  it("creates the changefeed", () => {
    changefeed = new Changefeed(opts);
    expect(changefeed.get_state()).toBe("disconnected");
  });

  it("initializes the changefeed", async () => {
    const init = await changefeed.connect();
    expect(changefeed.get_state()).toBe("connected");
    expect(init).toBe(init_val);
  });

  it("causes an update", (done) => {
    changefeed.on("update", (x) => {
      expect(x).toEqual({ action: "insert", new_val: { text: "bar" } });
      done();
    });
    got.do_query.cb(undefined, { action: "insert", new_val: { text: "bar" } });
  });

  it("ends the changefeed via query_cancel event", (done) => {
    changefeed.on("close", () => {
      expect(changefeed.get_state()).toBe("closed");
      done();
    });
    got.do_query.cb(undefined, { event: "query_cancel" });
  });

  it("creates changefeed again", async () => {
    changefeed = new Changefeed(opts);
    await changefeed.connect();
    expect(changefeed.get_state()).toBe("connected");
  });

  it("ends the changefeed via an error", (done) => {
    changefeed.on("close", () => {
      expect(changefeed.get_state()).toBe("closed");
      done();
    });
    got.do_query.cb("fatal");
  });

  it("creates changefeed again", async () => {
    changefeed = new Changefeed(opts);
    await changefeed.connect();
    expect(changefeed.get_state()).toBe("connected");
  });

  it("ends the changefeed via an error", (done) => {
    changefeed.on("close", () => {
      expect(changefeed.get_state()).toBe("closed");
      done();
    });
    got.do_query.cb("fatal");
  });

  it("creates changefeed again", async () => {
    changefeed = new Changefeed(opts);
    await changefeed.connect();
    expect(changefeed.get_state()).toBe("connected");
  });

  it("ends the changefeed by explicitly calling close", (done) => {
    changefeed.on("close", () => {
      expect(changefeed.get_state()).toBe("closed");
      done();
    });
    changefeed.close();
  });
});
