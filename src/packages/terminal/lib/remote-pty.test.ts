import { Terminal } from "./terminal";
import { getPrimusMock, isPidRunning, waitForPidToChange } from "./support";
import { getRemotePtyChannelName, getChannelName } from "./util";
import { RemoteTerminal } from "./remote-terminal";

afterAll(() => {
  setTimeout(process.exit, 250);
});

describe("tests remotePty connecting and handling data with **simulated** pty", () => {
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

  it("sends a cwd message from a client, then responds to that from the remoteSpark, and finally checks that the client gets it", async () => {
    spark1.emit("data", { cmd: "cwd" });
    spark1.messages = [];
    // wait for the message to get sent to our remote spark:
    expect(await remoteSpark.waitForMessage()).toEqual({ cmd: "cwd" });
    // send back a cwd
    remoteSpark.emit("data", { cmd: "cwd", payload: "/home/user" });
    expect(await spark1.waitForMessage()).toEqual({
      cmd: "cwd",
      payload: "/home/user",
    });
  });
});

describe("test remotePty using actual pty", () => {
  let terminal, remote;
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
    if (remote != null) {
      remote.close();
    }
  });

  it("initialize the terminal", async () => {
    await terminal.init();
    expect(typeof terminal.getPid()).toBe("number");
  });

  let spark;
  it("create a normal client connected to the terminal", async () => {
    spark = channel.createSpark("192.168.2.1");
    const mesg = await spark.waitForMessage();
    expect(mesg).toEqual({ cmd: "no-ignore" });
  });

  let remoteSpark;
  it("create remote terminal, and observe that local terminal process terminates", async () => {
    const pid = terminal.getPid();
    remoteSpark = ptyChannel.createSpark("192.168.2.2");
    remote = new RemoteTerminal(remoteSpark);
    expect(terminal.getPid()).toBe(undefined);
    // check that original process is no longer running.
    expect(await isPidRunning(pid)).toBe(false);
  });

  it("observe that remote terminal process gets created", async () => {
    // NOTE: we have to explicitly shuffle the messages along,
    // since our spark mock is VERY minimal and is the same object
    // for both the client and the server.
    const mesg = await remoteSpark.waitForMessage();
    remote.handleData(mesg);
    expect(remote.localPty).not.toEqual(null);
    const pid = remote.localPty.pid;
    expect(await isPidRunning(pid)).toBe(true);
  });

  it("use bash to compute something", async () => {
    const input = "expr 5077 \\* 389\n";
    const output = `${5077 * 389}`;
    spark.emit("data", input);

    // shuttle the data along (because our spark mock is so minimal)
    const data = await remoteSpark.waitForData(input);
    remote.handleData(data);

    // now push it back
    const out = await remoteSpark.waitForData(output);
    remoteSpark.emit("data", out);

    const out2 = await spark.waitForData(output);
    expect(out2).toContain("5077");
    expect(out2).toContain(output);
  });
});
