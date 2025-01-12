import * as nats from "nats.ws";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import type { WebappClient } from "./client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export class NatsClient {
  /*private*/ client: WebappClient;
  private sc: ReturnType<typeof nats.StringCodec>;
  private nc?: Awaited<ReturnType<typeof nats.connect>>;
  // obviously just for learning:
  public nats = nats;

  constructor(client: WebappClient) {
    this.client = client;
    this.sc = nats.StringCodec();
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
}
