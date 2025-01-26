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

  constructor({ client, query, options }: { client; query; options }) {
    super();
    this.client = client;
    this.query = query;
    this.options = options;
    console.log('changefeed-nats', this.query, this.options);
  }

  connect = async () => {
    this.natsSynctable = await this.client.nats_client.changefeed(this.query);
    this.interest();
    this.watch();
    return Object.values(await this.natsSynctable.get());
  };

  close = (): void => {
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
  private watch = async () => {
    if (this.natsSynctable == null) {
      return;
    }
    for await (const new_val of await this.natsSynctable.watch()) {
      if (this.state == "closed") {
        return;
      }
      this.emit("update", { action: "update", new_val });
    }
  };
}
