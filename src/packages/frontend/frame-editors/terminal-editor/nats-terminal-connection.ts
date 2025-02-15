import { webapp_client } from "@cocalc/frontend/webapp-client";
import { EventEmitter } from "events";
import { JSONCodec } from "nats.ws";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { uuid } from "@cocalc/util/misc";
import { delay } from "awaiting";
import { type DStream } from "@cocalc/nats/sync/dstream";
import { projectSubject } from "@cocalc/nats/names";
import {
  terminalService,
  type TerminalService,
} from "@cocalc/nats/service/terminal";
import { NATS_OPEN_FILE_TOUCH_INTERVAL } from "@cocalc/util/nats";

const jc = JSONCodec();
const client = uuid();

type State = "init" | "running" | "closed";

export class NatsTerminalConnection extends EventEmitter {
  private project_id: string;
  //private compute_server_id: number;
  private path: string;
  private cmd_subject: string;
  private state: State = "init";
  private stream?: DStream;
  private terminalResize;
  private openPaths;
  private closePaths;
  private service: TerminalService;
  private options?;

  constructor({
    project_id,
    compute_server_id,
    path,
    terminalResize,
    openPaths,
    closePaths,
    options,
  }: {
    project_id: string;
    compute_server_id: number;
    path: string;
    terminalResize;
    openPaths;
    closePaths;
    options?;
  }) {
    super();
    this.project_id = project_id;
    //this.compute_server_id = compute_server_id;
    this.path = path;
    this.options = options;
    this.touchLoop({ project_id, path });
    this.service = terminalService({ project_id, path });
    this.terminalResize = terminalResize;
    this.openPaths = openPaths;
    this.closePaths = closePaths;
    this.cmd_subject = projectSubject({
      project_id,
      compute_server_id,
      service: "terminal-cmd",
      path,
    });
  }

  write = async (data) => {
    if (this.state == "init") {
      // ignore initial data while initializing.
      // This is the trickt to avoid "junk characters" on refresh/reconnect.
      return;
    }
    if (this.state != "running") {
      await this.start();
    }
    if (typeof data != "string") {
      if (data.cmd == "size") {
        const { rows, cols } = data;
        if (
          rows <= 0 ||
          cols <= 0 ||
          rows == Infinity ||
          cols == Infinity ||
          isNaN(rows) ||
          isNaN(cols)
        ) {
          // invalid measurement -- ignore; https://github.com/sagemathinc/cocalc/issues/4158 and https://github.com/sagemathinc/cocalc/issues/4266
          return;
        }
        await this.service.call({ event: "size", rows, cols, client });
      } else if (data.cmd == "cwd") {
        await this.service.call({ event: "cwd" });
      } else if (data.cmd == "boot") {
        await this.service.call({ event: "boot", client });
      } else if (data.cmd == "kill") {
        await this.service.call({ event: "kill" });
      } else {
        throw Error(`todo -- implement cmd ${JSON.stringify(data)}`);
      }
      return;
    }
    try {
      await this.service.call({ event: "write", data });
    } catch (err) {
      console.log(err);
      // TODO: obviously wrong!  A timeout would restart our poor terminal!
      await this.start();
    }
  };

  touchLoop = async ({ project_id, path }) => {
    while (this.state != ("closed" as State)) {
      try {
        await webapp_client.touchOpenFile({
          project_id,
          path,
        });
      } catch (err) {
        console.warn(err);
      }
      if (this.state == ("closed" as State)) {
        break;
      }
      await delay(NATS_OPEN_FILE_TOUCH_INTERVAL);
    }
  };

  close = () => {
    this.stream?.close();
    delete this.stream;
    this.state = "closed";
  };

  end = () => {
    this.close();
  };

  private start = reuseInFlight(async () => {
    await this.service.call({ ...this.options, event: "create-session" });
  });

  private getStream = async () => {
    // TODO: idempotent, but move to project
    const { nats_client } = webapp_client;
    return await nats_client.dstream({
      name: `terminal-${this.path}`,
      project_id: this.project_id,
    });
  };

  init = async () => {
    this.state = "init";
    await this.start();
    this.stream = await this.getStream();
    this.consumeDataStream();
    this.subscribeToCommands();
  };

  private subscribeToCommands = async () => {
    const nc = await webapp_client.nats_client.getConnection();
    const sub = nc.subscribe(this.cmd_subject);
    for await (const mesg of sub) {
      if (this.state == "closed") {
        return;
      }
      this.handleCommand(mesg);
    }
  };

  private handleCommand = async (mesg) => {
    const x = jc.decode(mesg.data) as any;
    switch (x.cmd) {
      case "size":
        this.terminalResize(x);
        return;
      case "message":
        if (x.payload?.event == "open") {
          this.openPaths(x.payload.paths);
        } else if (x.payload?.event == "close") {
          this.closePaths(x.payload.paths);
        }
        return;
      default:
        console.log("TODO -- unhandled message from project:", x);
        return;
    }
  };

  private handleStreamMessage = (mesg) => {
    const data = mesg?.data;
    if (data) {
      this.emit("data", data);
    }
  };

  private consumeDataStream = () => {
    if (this.stream == null) {
      return;
    }
    for (const mesg of this.stream.get()) {
      this.handleStreamMessage(mesg);
    }
    this.setReady();
    this.stream.on("change", this.handleStreamMessage);
  };

  private setReady = async () => {
    // wait until after render loop of terminal before allowing writing,
    // or we get corruption.
    await delay(100); // todo is there a better way to know how long to wait?
    if (this.state == "init") {
      this.state = "running";
      this.emit("ready");
    }
  };
}
