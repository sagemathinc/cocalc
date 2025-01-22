import { webapp_client } from "@cocalc/frontend/webapp-client";
import { EventEmitter } from "events";
import { JSONCodec } from "nats.ws";
import sha1 from "sha1";

export class NatsTerminalConnection extends EventEmitter {
  private project_id: string;
  private path: string;
  private subject: string;
  private state: null | "running" | "off";

  constructor({ project_id, path }) {
    super();
    this.project_id = project_id;
    this.path = path;
    // move to util so guaranteed in sync with project
    this.subject = `project.${project_id}.terminal.${sha1(path)}`;
  }

  write = async (data) => {
    if (this.state != "running") {
      await this.start();
    }
    if (typeof data != "string") {
      //console.log("write -- todo:", data);
      // TODO: not yet implemented, e.g., {cmd: 'size', rows: 18, cols: 180}
      return;
    }
    const write = async () => {
      await webapp_client.nats_client.project({
        project_id: this.project_id,
        endpoint: "write-to-terminal",
        params: { path: this.path, data },
      });
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
  };

  private start = async () => {
    // ensure running:
    await webapp_client.nats_client.project({
      project_id: this.project_id,
      endpoint: "create-terminal",
      params: { path: this.path },
    });
  };

  private getConsumer = async () => {
    // TODO: idempotent, but move to project
    const { nats_client } = webapp_client;
    const stream = `project-${this.project_id}-terminal`;
    const nc = await nats_client.getConnection();
    const js = nats_client.jetstream.jetstream(nc);
    // consumer doesn't exist, so setup everything.
    const jsm = await nats_client.jetstream.jetstreamManager(nc);
    await jsm.streams.add({
      name: stream,
      subjects: [`project.${this.project_id}.terminal.>`],
      compression: "s2",
    });
    // making an ephemeral consumer for just one subject (e.g., this terminal frame)
    const { name } = await jsm.consumers.add(stream, {
      filter_subject: this.subject,
    });
    return await js.consumers.get(stream, name);
  };

  init = async () => {
    const jc = JSONCodec();
    const consumer = await this.getConsumer();
    await this.start();
    for await (const mesg of await consumer.consume()) {
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
