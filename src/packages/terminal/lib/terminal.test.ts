import { Terminal } from "./terminal";
import type { PrimusWithChannels } from "./types";
import { EventEmitter } from "events";
import { callback, delay } from "awaiting";
import type { Spark } from "primus";
import { uuid } from "@cocalc/util/misc";
import { exec } from "child_process";
import { once } from "@cocalc/util/async-utils";

import debug from "debug";
const logger = debug("cocalc:test:terminal");

const exec1 = (cmd: string, cb) => {
  exec(cmd, (_err, stdout, stderr) => {
    cb(undefined, { stdout, stderr });
  });
};

const isPidRunning = async (pid: number) => {
  const { stdout } = await callback(exec1, `ps -p ${pid} -o pid=`);
  return stdout.trim() != "";
};

const getCommandLine = async (pid) => {
  const { stdout } = await callback(exec1, `ps -p ${pid} -o comm=`);
  return stdout;
};

const waitForPidToChange = async (terminal, pid) => {
  let i = 1;
  while (true) {
    const newPid = terminal.getPid();
    if (newPid != null && newPid != pid) {
      return newPid;
    }
    await delay(5 * i);
    i += 1;
  }
};

afterAll(() => {
  // TODO: Somehow pty-node or something else randomly doesn't
  // allow jest for the terminal tests to exist.  I could
  // not figure this out after hours and hours, and we don't
  // need a guaranteed clean exit, so I'm putting this in for
  // now.  It would be nice if it wasn't needed.
  setTimeout(process.exit, 250);
});

class PrimusSparkMock extends EventEmitter {
  id: string = uuid();
  address: { ip: string };
  data: string = "";
  messages: object[] = [];

  constructor(ip: string) {
    super();
    this.address = { ip };
  }

  write = (data) => {
    logger("spark write", data);
    if (typeof data == "object") {
      this.messages.push(data);
    } else {
      this.data += data;
    }
    this.emit("write");
  };

  end = () => {
    this.emit("end");
    this.removeAllListeners();
    const t = this as any;
    delete t.id;
    delete t.address;
    delete t.data;
    delete t.messages;
  };

  waitForMessage = async () => {
    while (true) {
      if (this.messages.length > 0) {
        return this.messages.shift();
      }
      await once(this, "write");
    }
  };

  waitForData = async (x: number | string) => {
    let data = "";
    const isDone = () => {
      if (typeof x == "number") {
        return data.length >= x;
      } else {
        return data.includes(x);
      }
    };
    while (!isDone()) {
      if (this.data.length > 0) {
        data += this.data;
        // console.log("so far", { data });
        this.data = "";
      }
      if (!isDone()) {
        await once(this, "write");
      }
    }
    return data;
  };
}

class PrimusChannelMock extends EventEmitter {
  name: string;
  sparks: { [id: string]: Spark } = {};

  constructor(name) {
    super();
    this.name = name;
  }

  write = (data) => {
    if (this.sparks == null) return;
    for (const spark of Object.values(this.sparks)) {
      spark.write(data);
    }
  };

  createSpark = (address) => {
    const spark = new PrimusSparkMock(address) as unknown as Spark;
    this.sparks[spark.id] = spark;
    this.emit("connection", spark);
    this.on("end", () => {
      delete this.sparks[spark.id];
    });
    return spark;
  };

  destroy = () => {
    this.removeAllListeners();
    for (const spark of Object.values(this.sparks)) {
      spark.end();
    }
    const t = this as any;
    delete t.name;
    delete t.sparks;
  };
}

class PrimusMock {
  channels: PrimusChannelMock[] = [];

  channel = (name) => {
    const c = new PrimusChannelMock(name);
    this.channels.push(c);
    return c;
  };
}

function getPrimusMock(): PrimusWithChannels {
  const primus = new PrimusMock();
  return primus as unknown as PrimusWithChannels;
}

describe("very basic test of creating a terminal and changing shell", () => {
  let terminal;
  const path = ".a.term-0.term";
  const options = {
    path: "a.term",
  };

  beforeAll(() => {
    const primus = getPrimusMock();
    terminal = new Terminal(primus, path, options);
  });

  afterAll(() => {
    terminal.close();
  });

  it("checks conditions of terminal before it is initialized", () => {
    expect(terminal.getPid()).toBe(undefined);
    expect(terminal.getPath()).toBe(options.path);
    expect(terminal.getCommand()).toBe("/bin/bash");
  });

  it("initializes the terminal and checks conditions", async () => {
    await terminal.init();
    expect(typeof terminal.getPid()).toBe("number");
  });

  it("changes the shell to /bin/sh and sees that the pid changes", async () => {
    const pid = terminal.getPid();
    terminal.setCommand("/bin/sh", []);
    const newPid = await waitForPidToChange(terminal, pid);
    expect(pid).not.toBe(newPid);
    // check that original process is no longer running.
    expect(await isPidRunning(pid)).toBe(false);
  });
});

describe("create a shell, connect a client, and communicate with it", () => {
  let terminal;
  const path = ".a.term-0.term";
  const options = {
    path: "a.term",
  };
  const primus = getPrimusMock();

  beforeAll(() => {
    terminal = new Terminal(primus, path, options);
  });

  afterAll(() => {
    terminal.close();
  });

  it("initialize the terminal", async () => {
    await terminal.init();
    expect(typeof terminal.getPid()).toBe("number");
  });

  let spark;
  it("create a client connection to the terminal", () => {
    spark = (primus as any).channels[0].createSpark("192.168.2.1");
  });

  it("waits to receive no-ignore command", async () => {
    const mesg = await spark.waitForMessage();
    expect(mesg).toEqual({ cmd: "no-ignore" });
  });

  it("sets the terminal size and confirm it was set", async () => {
    const rows = 10,
      cols = 100;
    expect(terminal.client_sizes[spark.id]).toEqual(undefined);
    spark.emit("data", { cmd: "size", rows, cols });
    expect(terminal.client_sizes[spark.id]).toEqual({ rows, cols });
    // also confirm receipt of size message
    const mesg = await spark.waitForMessage();
    expect(mesg).toEqual({ cmd: "size", rows, cols });
  });

  it("gets the current working directory via a command", async () => {
    spark.emit("data", { cmd: "cwd" });
    const mesg = await spark.waitForMessage();
    expect(mesg.cmd).toBe("cwd");
    expect(process.cwd().endsWith(mesg.payload)).toBe(true);
  });

  it("write pwd to terminal and get back the current working directory", async () => {
    spark.emit("data", "pwd\n");
    spark.data = "";
    const resp = await spark.waitForData(process.cwd());
    expect(resp).toContain(process.cwd());
  });

  it("send kill command and see that pid changes", async () => {
    const pid = terminal.getPid();
    spark.emit("data", { cmd: "kill" });
    const newPid = await waitForPidToChange(terminal, pid);
    expect(pid).not.toBe(newPid);
    expect(await isPidRunning(pid)).toBe(false);
  });

  it("set shell with set_command see that pid changes", async () => {
    const pid = terminal.getPid();
    spark.emit("data", {
      cmd: "set_command",
      command: "/usr/bin/sleep",
      args: ["1000"],
    });
    const newPid = await waitForPidToChange(terminal, pid);
    expect(pid).not.toBe(newPid);
    expect(await isPidRunning(pid)).toBe(false);
    expect(await getCommandLine(newPid)).toContain("sleep");
  });

  it("send some data, then disconnect and reconnect, and verify that history contains that data, and also that terminal continues to work", async () => {
    spark.emit("data", "echo 'hello cocalc'\n");
    const resp = await spark.waitForData("hello cocalc");
    expect(resp).toContain("hello cocalc");
    spark.end();
    const id = spark.id;
    spark = (primus as any).channels[0].createSpark("192.168.2.1");
    expect(id).not.toEqual(spark.id);
    const mesg = await spark.waitForMessage();
    expect(mesg).toEqual({ cmd: "no-ignore" });
    expect(spark.data).toContain("hello cocalc");
    spark.data = "";
  });
});

describe("collaboration -- two clients connected to the same terminal session", () => {
  let terminal;
  const path = ".a.term-0.term";
  const options = {
    path: "a.term",
  };
  const primus = getPrimusMock();

  beforeAll(() => {
    terminal = new Terminal(primus, path, options);
  });

  afterAll(() => {
    terminal.close();
  });

  it("initialize the terminal", async () => {
    await terminal.init();
  });

  let spark1, spark2;
  it("create two clients connection to the terminal", async () => {
    spark1 = (primus as any).channels[0].createSpark("192.168.2.1");
    spark2 = (primus as any).channels[0].createSpark("192.168.2.2");
    const mesg1 = await spark1.waitForMessage();
    expect(mesg1).toEqual({ cmd: "no-ignore" });
    const mesg2 = await spark2.waitForMessage();
    expect(mesg2).toEqual({ cmd: "no-ignore" });
  });

  it("have one client send something, and both clients see the input and result", async () => {
    const input = "expr 5077 \\* 389\n";
    const output = `${5077 * 389}`;
    spark1.emit("data", input);
    const out1 = await spark1.waitForData(output);
    expect(out1).toContain("5077");
    expect(out1).toContain(output);
    const out2 = await spark2.waitForData(output);
    expect(out2).toContain("5077");
    expect(out2).toContain(output);
    // also check that output only appears once:
    let i = out2.indexOf(output);
    expect(out2.indexOf(output, i + 1)).toBe(-1);
  });

  it("set the sizes of the two clients; verify that the min size is returned", async () => {
    const rows1 = 15,
      cols1 = 90;
    const rows2 = 20,
      cols2 = 70;
    spark1.emit("data", { cmd: "size", rows: rows1, cols: cols1 });
    const mesg1 = await spark1.waitForMessage();
    expect(mesg1).toEqual({ cmd: "size", rows: rows1, cols: cols1 });
    const mesg1a = await spark2.waitForMessage();
    expect(mesg1).toEqual({ cmd: "size", rows: rows1, cols: cols1 });
    spark2.emit("data", { cmd: "size", rows: rows2, cols: cols2 });
    const mesg2 = await spark2.waitForMessage();
    expect(mesg2).toEqual({
      cmd: "size",
      rows: Math.min(rows1, rows2),
      cols: Math.min(cols1, cols2),
    });
  });
});
