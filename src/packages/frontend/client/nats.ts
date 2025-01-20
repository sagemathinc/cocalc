import * as nats from "nats.ws";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import type { WebappClient } from "./client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export class NatsClient {
  /*private*/ client: WebappClient;
  private sc = nats.StringCodec();
  private jc = nats.JSONCodec();
  private nc?: Awaited<ReturnType<typeof nats.connect>>;
  // obviously just for learning:
  public nats = nats;

  constructor(client: WebappClient) {
    this.client = client;
  }

  getConnection = reuseInFlight(async () => {
    if (this.nc != null) {
      return this.nc;
    }
    const server = `${location.protocol == "https:" ? "wss" : "ws"}://${location.host}${appBasePath}/nats`;
    console.log(`connecting to ${server}...`);
    this.nc = await nats.connect({ servers: [server] });
    console.log(`connected to ${server}`);
    return this.nc;
  });

  request = async (subject: string, data: string) => {
    const c = await this.getConnection();
    const resp = await c.request(subject, this.sc.encode(data));
    return this.sc.decode(resp.data);
  };

  api = async ({ endpoint, params }: { endpoint: string; params?: object }) => {
    const c = await this.getConnection();
    const subject = `hub.api.${this.client.account_id}`;
    console.log(`publishing to subject='${subject}'`);
    const resp = await c.request(
      subject,
      this.jc.encode({
        endpoint,
        account_id: this.client.account_id,
        params,
      }),
    );
    const x = this.jc.decode(resp.data);
    console.log("got back ", x);
    return x;
  };

  project = async ({
    project_id,
    endpoint,
    params,
  }: {
    project_id: string;
    endpoint: string;
    params?: object;
  }) => {
    const c = await this.getConnection();
    const resp = await c.request(
      `projects.${project_id}.api`,
      this.jc.encode({
        endpoint,
        params,
      }),
    );
    return this.jc.decode(resp.data);
  };
}
