import { Terminal } from "./terminal";
import type { PrimusWithChannels } from "./types";
import { EventEmitter } from "events";
import { delay } from "awaiting";

class PrimusChannelMock extends EventEmitter {
  name: string;
  data: string = "";

  constructor(name) {
    super();
    this.name = name;
  }

  write = (data) => {
    this.data += data;
  };
}

class PrimusMock {
  channel = (name) => {
    return new PrimusChannelMock(name);
  };
}

function getPrimusMock(): PrimusWithChannels {
  const primus = new PrimusMock();
  return primus as unknown as PrimusWithChannels;
}

describe("basic tests of the terminal", () => {
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
    let newPid;
    // there's no even or way to tell it restarted except by watching.
    for (let i = 0; i < 30; i++) {
      newPid = terminal.getPid();
      if (typeof newPid != null && newPid != pid) break;
      await delay(10 * i);
    }
    expect(pid).not.toBe(newPid);
  });
});
