import { webapp_client } from "@cocalc/frontend/webapp-client";
import { EventEmitter } from "events";
import { JSONCodec } from "nats.ws";

export class NatsTerminalConnection extends EventEmitter {
  private project_id: string;
  private path: string;

  constructor({ project_id, path }) {
    super();
    this.project_id = project_id;
    this.path = path;
  }

  write = async (data) => {
    if (typeof data != "string") {
      console.log("write -- todo:", data);
      // TODO: not yet implemented, e.g., {cmd: 'size', rows: 18, cols: 180}
      return;
    }
    await webapp_client.nats_client.project({
      project_id: this.project_id,
      endpoint: "write-to-terminal",
      params: { path: this.path, data },
    });
  };

  end = () => {
    // todo
  };

  init = async () => {
    const jc = JSONCodec();
    const { subject } = (await webapp_client.nats_client.project({
      project_id: this.project_id,
      endpoint: "create-terminal",
      params: { path: this.path },
    })) as any;
    const nc = await webapp_client.nats_client.getConnection();
    const sub = nc.subscribe(subject);
    for await (const mesg of sub) {
      const { exit, data } = jc.decode(mesg.data) as any;
      if (exit) {
        this.emit("close");
        break;
      } else if (data != null) {
        this.emit("data", data);
      }
    }
  };
}
