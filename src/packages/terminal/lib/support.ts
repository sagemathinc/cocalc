/*
Some mocking and other funtionality that is very useful for unit testing.

The code below does not use Primus *at all* to implement anything -- it's just
a lightweight mocking of the same thing in process for unit testing purposes.
*/

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

export const isPidRunning = async (pid: number) => {
  const { stdout } = await callback(exec1, `ps -p ${pid} -o pid=`);
  return stdout.trim() != "";
};

export const getCommandLine = async (pid) => {
  const { stdout } = await callback(exec1, `ps -p ${pid} -o comm=`);
  return stdout;
};

export const waitForPidToChange = async (terminal, pid) => {
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
  channels: { [name: string]: PrimusChannelMock } = {};

  channel = (name) => {
    if (this.channels[name] == null) {
      this.channels[name] = new PrimusChannelMock(name);
    }
    return this.channels[name];
  };
}

export function getPrimusMock(): PrimusWithChannels {
  const primus = new PrimusMock();
  return primus as unknown as PrimusWithChannels;
}
