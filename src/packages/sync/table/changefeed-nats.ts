/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import type { State } from "./changefeed";
import { delay } from "awaiting";

export class NatsChangefeed extends EventEmitter {
  private client;
  private query;
  private options;
  private state: State = "disconnected";
  private natsSynctable?;
  private watch?;

  constructor({ client, query, options }: { client; query; options? }) {
    super();
    this.client = client;
    this.query = query;
    this.options = options;
    if (this.options != null && this.options.length > 0) {
      console.log("NatsChangefeed -- todo: options not implemented", options);
    }
  }

  connect = async () => {
    this.natsSynctable = await this.client.nats_client.changefeed(this.query);
    this.interest();
    this.startWatch();
    return Object.values(await this.natsSynctable.get());
  };

  close = (): void => {
    if (this.watch != null) {
      this.watch.stop();
      delete this.watch;
    }
    this.state = "closed";
    this.emit("close");
  };

  get_state = (): string => {
    return this.state;
  };

  private interest = async () => {
    await delay(30000);
    while (this.state != "closed") {
      // console.log("express interest in", this.query);
      await this.client.nats_client.changefeedInterest(this.query);
      await delay(30000);
    }
  };

  private startWatch = async () => {
    if (this.natsSynctable == null) {
      return;
    }
    this.watch = await this.natsSynctable.watch();
    for await (const new_val of this.watch) {
      this.emit("update", { action: "update", new_val });
    }
  };
}
