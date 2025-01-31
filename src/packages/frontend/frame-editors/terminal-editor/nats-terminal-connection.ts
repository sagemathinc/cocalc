import { webapp_client } from "@cocalc/frontend/webapp-client";
import { EventEmitter } from "events";
import { JSONCodec } from "nats.ws";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { uuid } from "@cocalc/util/misc";
import { delay } from "awaiting";
import { projectStreamName, projectSubject } from "@cocalc/nats/names";

const jc = JSONCodec();
const client = uuid();

export class NatsTerminalConnection extends EventEmitter {
  private project_id: string;
  private compute_server_id: number;
  private path: string;
  private subject: string;
  private cmd_subject: string;
  private state: null | "running" | "init" | "closed";
  private consumer?;
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
    this.compute_server_id = compute_server_id;
    this.path = path;
    this.terminalResize = terminalResize;
    this.keep = keep;
    this.openPaths = openPaths;
    this.closePaths = closePaths;
    this.project = webapp_client.nats_client.projectApi({ project_id });
    this.subject = projectSubject({
      project_id,
      compute_server_id,
      service: "terminal",
      path,
    });
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
    // todo
    this.state = "closed";
  };

  private start = reuseInFlight(async () => {
    // ensure running:
    await this.project.terminal.create({ path: this.path });
  });

  private getConsumer = async () => {
    // TODO: idempotent, but move to project
    const { nats_client } = webapp_client;
    const streamName = projectStreamName({
      project_id: this.project_id,
      compute_server_id: this.compute_server_id,
      service: "terminal",
    });
    const nc = await nats_client.getConnection();
    const js = nats_client.jetstream.jetstream(nc);
    // consumer doesn't exist, so setup everything.
    const jsm = await nats_client.jetstream.jetstreamManager(nc);
    // making an ephemeral consumer for just one subject (e.g., this terminal frame)
    const { name } = await jsm.consumers.add(streamName, {
      filter_subject: this.subject,
    });
    return await js.consumers.get(streamName, name);
  };

  init = async () => {
    this.state = "init";
    await this.start();
    this.consumer = await this.getConsumer();
    this.consumeDataStream();
    this.subscribeToCommands();
  };

  private handle = (mesg) => {
    if (this.state == "closed") {
      return true;
    }
    const x = jc.decode(mesg.data) as any;
    if (x?.data != null) {
      this.emit("data", x?.data);
    }
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

  private consumeDataStream = async () => {
    if (this.consumer == null) {
      return;
    }
    const messages = await this.consumer.fetch({
      max_messages: 100000, // should only be a few hundred in practice
      expires: 1000,
    });
    for await (const mesg of messages) {
      if (this.handle(mesg)) {
        return;
      }
      if (mesg.info.pending == 0) {
        // no further messages pending, so switch to consuming below
        // TODO: I don't know if there is some chance to miss a message?
        //       This is a *terminal* so purely visual so not too critical.
        break;
      }
    }

    this.setReady();

    for await (const mesg of await this.consumer.consume()) {
      if (this.handle(mesg)) {
        return;
      }
    }
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
