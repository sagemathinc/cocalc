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
    this.natsSynctable = await this.client.nats_client.changefeed(this.query, {
      atomic: false,
      immutable: false,
    });
    this.interest();
    this.startWatch();
    const v = this.natsSynctable.get();
    return Object.values(v);
  };

  close = (): void => {
    this.natsSynctable?.close();
    this.state = "closed";
    this.emit("close"); // yes "close" not "closed" ;-(
  };

  get_state = (): string => {
    return this.state;
  };

  private interest = async () => {
    let d = 10000;
    await delay(d);
    while (this.state != "closed") {
      // console.log("express interest in", this.query);
      try {
        await this.client.nats_client.changefeedInterest(this.query);
        d = Math.min(45000, 1.3 * d) + Math.random();
      } catch (err) {
        if (err.code != "TIMEOUT") {
          // it's normal for this to throw a TIMEOUT error whenever the browser isn't connected to NATS,
          // so we only log it to the console if it is unexpected.
          console.log("WARNING: issue updating changefeed interest", err);
        } else {
          // reset to be more frequently since likely disconnected.
          d = 10000;
        }
      }
      await delay(d);
    }
  };

  private startWatch = () => {
    if (this.natsSynctable == null) {
      return;
    }
    this.natsSynctable.on("change", ({ value: new_val, prev: old_val }) => {
      // console.log("natsSynctable, change, ", { new_val, old_val });
      if (new_val == null) {
        this.emit("delete", { action: "delete", old_val });
      } else {
        this.emit("update", { action: "update", new_val, old_val });
      }
    });
  };
}
