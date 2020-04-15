import { WebappClient } from "./client";
import * as message from "smc-util/message";

export class TrackingClient {
  private client: WebappClient;

  constructor(client: WebappClient) {
    this.client = client;
  }

  // Send metrics to the hub this client is connected to.
  // There is no confirmation or response that this succeeded,
  // which is fine, since dropping some metrics is fine.
  public send_metrics(metrics: object): void {
    this.client.send(message.metrics({ metrics }));
  }

  public async user_tracking(evt: string, value: object): Promise<void> {
    await this.client.async_call({
      message: message.user_tracking({ evt, value }),
    });
  }
}
