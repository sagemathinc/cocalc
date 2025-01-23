import { webapp_client } from "@cocalc/frontend/webapp-client";
import { EventEmitter } from "events";
import { JSONCodec } from "nats.ws";
import sha1 from "sha1";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { uuid } from "@cocalc/util/misc";

const jc = JSONCodec();
const client = uuid();

export class NatsTerminalConnection extends EventEmitter {
  private project_id: string;
  private path: string;
  private subject: string;
  private state: null | "running" | "init" | "closed";
  private consumer?;
  // keep = optional number of messages to retain between clients/sessions/view, i.e.,
  // "amount of history". This is global to all terminals in the project.
  private keep?: number;
  private terminalResize;

  constructor({
    project_id,
    path,
    keep,
    terminalResize,
  }: {
    project_id: string;
    path: string;
    keep?: number;
    terminalResize;
  }) {
    super();
    this.project_id = project_id;
    this.path = path;
    this.terminalResize = terminalResize;
    this.keep = keep;
    // move to util so guaranteed in sync with project
    this.subject = `project.${project_id}.terminal.${sha1(path)}`;
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
      console.log("to project", data);
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
      const resp = await webapp_client.nats_client.project({
        project_id: this.project_id,
        endpoint: "terminal-command",
        params: { path: this.path, ...data, client },
      });
      console.log("got back ", resp);
      return;
    }
    const f = async () => {
      await webapp_client.nats_client.project({
        project_id: this.project_id,
        endpoint: "write-to-terminal",
        params: { path: this.path, data, keep: this.keep },
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
    await webapp_client.nats_client.project({
      project_id: this.project_id,
      endpoint: "create-terminal",
      params: { path: this.path },
    });
  });

  private getConsumer = async () => {
    // TODO: idempotent, but move to project
    const { nats_client } = webapp_client;
    const stream = `project-${this.project_id}-terminal`;
    const nc = await nats_client.getConnection();
    const js = nats_client.jetstream.jetstream(nc);
    // consumer doesn't exist, so setup everything.
    const jsm = await nats_client.jetstream.jetstreamManager(nc);
    // making an ephemeral consumer for just one subject (e.g., this terminal frame)
    const { name } = await jsm.consumers.add(stream, {
      filter_subject: this.subject,
    });
    return await js.consumers.get(stream, name);
  };

  init = async () => {
    this.state = "init";
    await this.start();
    this.consumer = await this.getConsumer();
    this.run();
  };

  private handle = (mesg) => {
    if (this.state == "closed") {
      return true;
    }
    const x = jc.decode(mesg.data) as any;
    if (x?.data != null) {
      this.emit("data", x?.data);
    } else {
      switch (x.cmd) {
        case "size":
          this.terminalResize(x);
          return;
        default:
          console.log("TODO -- unhandled message from project:", x);
          return;
      }
    }
  };

  private run = async () => {
    if (this.consumer == null) {
      return;
    }
    const messages = await this.consumer.fetch({
      max_messages: 10000,
      expires: 1000,
    });
    for await (const mesg of messages) {
      if (this.handle(mesg)) {
        return;
      }
    }
    if (this.state == "init") {
      this.state = "running";
      this.emit("ready");
    }
    // TODO: this loop runs until state = closed or this.consumer.closed()... ?
    for await (const mesg of await this.consumer.consume()) {
      if (this.handle(mesg)) {
        return;
      }
    }
  };
}
