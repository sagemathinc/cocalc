import { Terminal } from "./terminal";
import { getPrimusMock, isPidRunning, waitForPidToChange } from "./support";
import { getRemotePtyChannelName, getChannelName } from "./util";

afterAll(() => {
  setTimeout(process.exit, 250);
});

describe("basic tests of a remotePty connecting and handling data", () => {
  let terminal;
  const path = ".a.term-0.term";
  const options = {
    path: "a.term",
  };
  const primus = getPrimusMock();
  const channel = primus.channel(getChannelName(path));
  const ptyChannel = primus.channel(getRemotePtyChannelName(path));

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

  let spark1, spark2;
  it("create two clients connection to the terminal", async () => {
    await terminal.init();
    spark1 = channel.createSpark("192.168.2.1");
    spark2 = channel.createSpark("192.168.2.2");
    for (const s of [spark1, spark2]) {
      const mesg = await s.waitForMessage();
      expect(mesg).toEqual({ cmd: "no-ignore" });
    }
  });

  let remoteSpark;
  it("connect to remote pty channel and observe that local terminal process terminates", async () => {
    const pid = terminal.getPid();
    remoteSpark = ptyChannel.createSpark("192.168.2.2");
    expect(terminal.getPid()).toBe(undefined);
    // check that original process is no longer running.
    expect(await isPidRunning(pid)).toBe(false);
  });

  it("send data from spark1 and see that it is received by the remoteSpark, then respond and see that the client sparks both receive the response", async () => {
    // reset client data state
    spark1.data = spark2.data = "";
    spark1.emit("data", "17+13");
    expect(await remoteSpark.waitForData("17+13")).toBe("17+13");
    remoteSpark.emit("data", "30");
    expect(await spark1.waitForData("30")).toBe("30");
    expect(await spark2.waitForData("30")).toBe("30");
  });

  it("disconect the remoteSpark and see that a local pty is spawned again", async () => {
    remoteSpark.end();
    await waitForPidToChange(terminal, 0);
    const pid = terminal.getPid();
    expect(await isPidRunning(pid)).toBe(true);
  });

  it("connect a remote pty again, send a kill command from one of the spark clients, and check that remote pty receives kill command", async () => {
    remoteSpark = ptyChannel.createSpark("192.168.2.2");
    expect((await remoteSpark.waitForMessage()).cmd).toBe("init");
    spark1.emit("data", { cmd: "kill" });
    expect(await remoteSpark.waitForMessage()).toEqual({ cmd: "kill" });
  });

  it("sends a change of commands and args from client and sees remote pty receives that", async () => {
    const command = "/usr/bin/python3";
    const args = ["-b"];
    spark1.emit("data", {
      cmd: "set_command",
      command,
      args,
    });
    expect(await remoteSpark.waitForMessage()).toEqual({
      cmd: "set_command",
      command,
      args,
    });
  });

  it("sends a size message from a client, and observes that remote pty receives a size message", async () => {
    const rows = 10;
    const cols = 50;
    const mesg = { cmd: "size", rows, cols };
    spark1.emit("data", mesg);
    expect(await remoteSpark.waitForMessage()).toEqual(mesg);
  });
});
