import { Terminal } from "./terminal";
import type { PrimusWithChannels } from "./types";
import type { Spark } from "primus";
import { EventEmitter } from "events";

class SparkMock {}

class PrimusChannelMock extends EventEmitter {
  name: string;

  constructor(name) {
    super();
    this.name = name;
  }
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

  beforeAll(() => {
    const primus = getPrimusMock();
    terminal = new Terminal(primus, "a.term");
  });

  afterAll(() => {
    terminal.close();
  });

  it("checks conditions of terminal before it is initialized", () => {
    expect(terminal.getPid()).toBe(undefined);
  });

  it("initializes the terminal and checks conditions", async () => {
    await terminal.init();
    expect(typeof terminal.getPid()).toBe("number");
  });
});
