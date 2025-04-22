/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import type { State } from "./changefeed";
import { delay } from "awaiting";
import { CHANGEFEED_INTEREST_PERIOD_MS } from "@cocalc/nats/sync/synctable";
import { waitUntilConnected } from "@cocalc/nats/util";

export class NatsChangefeed extends EventEmitter {
  private client;
  private nc;
  private query;
  private options;
  private state: State = "disconnected";
  private natsSynctable?;

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
    await waitUntilConnected();
    this.natsSynctable = await this.client.nats_client.changefeed(this.query, {
      // atomic=false means less data transfer on changes, but simply does not scale up
      // well and is hence quite slow overall.
      atomic: true,
      immutable: false,
    });
    this.state = "connected";
    this.nc = await this.client.nats_client.getConnection();
    this.nc.on("reconnect", this.expressInterest);
    this.interest();
    this.startWatch();
    const v = this.natsSynctable.get();
    return Object.values(v);
  };

  close = (): void => {
    this.nc.removeListener("reconnect", this.expressInterest);
    this.natsSynctable?.close();
    this.state = "closed";
    this.emit("close"); // yes "close" not "closed" ;-(
  };

  get_state = (): string => {
    return this.state;
  };

  private expressInterest = async () => {
    try {
      await waitUntilConnected();
      await this.client.nats_client.changefeedInterest(this.query);
    } catch (err) {
      console.log(`WARNING: changefeed -- ${err}`, this.query);
    }
  };

  private interest = async () => {
    while (this.state != "closed") {
      await this.expressInterest();
      await delay(CHANGEFEED_INTEREST_PERIOD_MS / 2.1);
    }
  };

  private startWatch = () => {
    if (this.natsSynctable == null) {
      return;
    }
    this.natsSynctable.on(
      "change",
      (_, { key, value: new_val, prev: old_val }) => {
        let x;
        if (new_val == null) {
          x = { action: "delete", old_val, key };
        } else if (old_val !== undefined) {
          x = { action: "update", new_val, old_val, key };
        } else {
          x = { action: "insert", new_val, key };
        }
        this.emit("update", x);
      },
    );
  };
}
