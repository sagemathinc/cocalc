import { Terminal } from "./terminal";
import { getPrimusMock } from "./support";

describe("basic tests of a remotePty connecting and handling data", () => {
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
});
