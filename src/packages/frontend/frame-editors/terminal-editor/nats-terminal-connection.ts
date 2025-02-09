import { webapp_client } from "@cocalc/frontend/webapp-client";
import { EventEmitter } from "events";
import { JSONCodec } from "nats.ws";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { uuid } from "@cocalc/util/misc";
import { delay } from "awaiting";
import { type DStream } from "@cocalc/nats/sync/dstream";
import { projectSubject } from "@cocalc/nats/names";

const jc = JSONCodec();
const client = uuid();

export class NatsTerminalConnection extends EventEmitter {
  private project_id: string;
  //private compute_server_id: number;
  private path: string;
  private cmd_subject: string;
  private state: null | "running" | "init" | "closed";
  private stream?: DStream;
  // keep = optional number of messages to retain between clients/sessions/view, i.e.,
  // "amount of history". This is global to all terminals in the project.
  private keep?: number;
  private terminalResize;
  private openPaths;
  private closePaths;
  private project;

  constructor({
    project_id,
    compute_server_id,
    path,
    keep,
    terminalResize,
    openPaths,
    closePaths,
  }: {
    project_id: string;
    compute_server_id: number;
    path: string;
    keep?: number;
    terminalResize;
    openPaths;
    closePaths;
  }) {
    super();
    this.project_id = project_id;
    //this.compute_server_id = compute_server_id;
    this.path = path;
    this.terminalResize = terminalResize;
    this.keep = keep;
    this.openPaths = openPaths;
    this.closePaths = closePaths;
    this.project = webapp_client.nats_client.projectApi({ project_id });
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
      }
      await this.project.terminal.command({ path: this.path, ...data, client });
      return;
    }
    const f = async () => {
      await this.project.terminal.write({
        path: this.path,
        data,
        keep: this.keep,
      });
    };

    try {
      await f();
    } catch (_err) {
      await this.start();
      await f();
    }
  };

  end = () => {
    this.stream?.close();
    delete this.stream;
    // todo -- anything else?
    this.state = "closed";
  };

  private start = reuseInFlight(async () => {
    // ensure running:
    await this.project.terminal.create({ path: this.path });
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
