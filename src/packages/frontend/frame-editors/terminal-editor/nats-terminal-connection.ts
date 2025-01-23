import { webapp_client } from "@cocalc/frontend/webapp-client";
import { EventEmitter } from "events";
import { JSONCodec } from "nats.ws";
import sha1 from "sha1";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export class NatsTerminalConnection extends EventEmitter {
  private project_id: string;
  private path: string;
  private subject: string;
  private state: null | "running" | "off" | "closed";
  private consumer?;
  private startInit: number = 0;

  constructor({ project_id, path }) {
    super();
    this.project_id = project_id;
    this.path = path;
    // move to util so guaranteed in sync with project
    this.subject = `project.${project_id}.terminal.${sha1(path)}`;
  }

  write = async (data) => {
    if (Date.now() - this.startInit <= 2000) {
      // ignore initial data while initializing (e.g., first 2 seconds for now -- TODO: use nats more cleverly)
      // This is the trickt to avoid "junk characters" on refresh/reconnect.
      return;
    }
    if (this.state != "running") {
      await this.start();
    }
    if (typeof data != "string") {
      //console.log("write -- todo:", data);
      // TODO: not yet implemented, e.g., {cmd: 'size', rows: 18, cols: 180}
      return;
    }
    const write = async () => {
      const f = async () => {
        await webapp_client.nats_client.project({
          project_id: this.project_id,
          endpoint: "write-to-terminal",
          params: { path: this.path, data },
        });
      };
      try {
        await f();
      } catch (_err) {
        await this.start();
        await f();
      }
    };
    try {
      await write();
    } catch (_) {
      await this.start();
      await write();
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
    await this.start();
    this.consumer = await this.getConsumer();
    this.run();
  };

  private run = async () => {
    if (this.consumer == null) {
      return;
    }
    const jc = JSONCodec();
    // this loop runs forever (or until state = closed or this.consumer.closed())...
    this.startInit = Date.now();
    for await (const mesg of await this.consumer.consume()) {
      if (this.state == "closed") {
        return;
      }
      const { exit, data } = jc.decode(mesg.data) as any;
      if (exit) {
        this.state = "off";
      } else if (data != null) {
        this.state = "running";
        this.emit("data", data);
      }
    }
  };
}
