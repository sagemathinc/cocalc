/*

NOTE: these tests are pretty low level.  We don't actually use a websocket at all,
and explicitly shuffle messages around.

---
*/

import { Terminal } from "./terminal";
import {
  getOpts,
  getPrimusMock,
  isPidRunning,
  waitForPidToChange,
} from "./support";
import { getRemotePtyChannelName, getChannelName } from "./util";
import { until } from "@cocalc/util/async-utils";

describe("tests remotePty connecting and handling data with **simulated** pty and explicitly pushing messages back and forth (for low level tests)", () => {
  let terminal;
  const { path, options } = getOpts();
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
      // it initially tells us the current computeServerId, right when we connect.
      const mesg1 = await s.waitForMessage();
      expect(mesg1).toEqual({ cmd: "computeServerId", id: 0 });
      const mesg2 = await s.waitForMessage();
      expect(mesg2).toEqual({ cmd: "no-ignore" });
    }
  });

  let remoteSpark;
  it("connect to remote pty channel and observe that local terminal process terminates", async () => {
    const pid = terminal.getPid();
    remoteSpark = ptyChannel.createSpark("192.168.2.2");
    expect(terminal.getPid()).toBe(undefined);
    await until(async () => {
      return (await isPidRunning(pid)) == false;
    });
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
    await until(async () => {
      return (await isPidRunning(pid)) == true;
    });
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

// I disabled all of these for now.  They are too difficult to maintain since they are so "fake".

// describe("test remotePty using actual pty", () => {
//   let terminal, remote;
//   const { path, options } = getOpts();
//   const primus = getPrimusMock();
//   const channel = primus.channel(getChannelName(path));
//   const ptyChannel = primus.channel(getRemotePtyChannelName(path));

//   beforeAll(async () => {
//     await delay(1000);
//     terminal = new Terminal(primus, path, options);
//   });

//   afterAll(() => {
//     terminal.close();
//     if (remote != null) {
//       remote.close();
//     }
//   });

//   it("initialize the terminal", async () => {
//     await terminal.init();
//     expect(typeof terminal.getPid()).toBe("number");
//   });

//   let spark;
//   it("create a normal client connected to the terminal", async () => {
//     spark = channel.createSpark("192.168.2.1");
//     const mesg = await spark.waitForMessage();
//     expect(mesg).toEqual({ cmd: "no-ignore" });
//   });

//   let remoteSpark;
//   it("create remote terminal, and observe that local terminal process terminates", async () => {
//     const pid = terminal.getPid();
//     remoteSpark = ptyChannel.createSpark("192.168.2.2");
//     remote = new RemoteTerminal(remoteSpark);
//     expect(terminal.getPid()).toBe(undefined);
//     // check that original process is no longer running.
//     expect(await isPidRunning(pid)).toBe(false);
//   });

//   it("observe that remote terminal process gets created", async () => {
//     // NOTE: we have to explicitly shuffle the messages along,
//     // since our spark mock is VERY minimal and is the same object
//     // for both the client and the server.

//     const mesg = await remoteSpark.waitForMessage();
//     remote.handleData(mesg);

//     expect(remote.localPty).not.toEqual(undefined);
//     const pid = remote.localPty.pid;
//     expect(await isPidRunning(pid)).toBe(true);
//   });

//   it("use bash to compute something", async () => {
//     const input = "expr 5077 \\* 389\n";
//     const output = `${5077 * 389}`;
//     spark.emit("data", input);

//     // shuttle the data along:
//     const data = await remoteSpark.waitForData(input);
//     remote.handleData(data);
//     const out = await remoteSpark.waitForData(output);
//     remoteSpark.emit("data", out);

//     const out2 = await spark.waitForData(output);
//     expect(out2).toContain("5077");
//     expect(out2).toContain(output);
//   });

//   it("have client send a size, and see the remote terminal gets that size", async () => {
//     spark.emit("data", { cmd: "size", rows: 10, cols: 69 });
//     const mesg = await remoteSpark.waitForMessage();
//     remote.handleData(mesg);
//     expect(mesg).toEqual({ cmd: "size", rows: 10, cols: 69 });
//     // now ask the terminal for its size
//     spark.emit("data", "stty size\n");

//     const data = await remoteSpark.waitForData("stty size\n");
//     remote.handleData(data);
//     const out = await remoteSpark.waitForData("10 69");
//     remoteSpark.emit("data", out);

//     const out2 = await spark.waitForData("10 69");
//     expect(out2.trim().slice(-5)).toBe("10 69");
//   });

//   it("tests the cwd command", async () => {
//     spark.messages = [];
//     // first from browser client to project:
//     spark.emit("data", { cmd: "cwd" });
//     const mesg = await remoteSpark.waitForMessage();
//     remote.handleData(mesg);
//     const mesg2 = await remoteSpark.waitForMessage();
//     expect(mesg2.payload).toContain("terminal");
//     remoteSpark.emit("data", mesg2);
//     const mesg3 = await spark.waitForMessage();
//     expect(mesg3).toEqual(mesg2);
//   });

//   // do this last!
//   it("close the RemoteTerminal, and see that a local pty is spawned again", async () => {
//     remote.close();
//     await waitForPidToChange(terminal, 0);
//     const pid = terminal.getPid();
//     expect(await isPidRunning(pid)).toBe(true);
//   });
// });
