/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { changefeed, type Changefeed } from "@cocalc/conat/hub/changefeeds";
import { conat } from "@cocalc/conat/client";

// low level debugging of changefeeds
const LOW_LEVEL_DEBUG = false;
const log = LOW_LEVEL_DEBUG
  ? (...args) => {
      console.log("changefeed: ", ...args);
    }
  : (..._args) => {};

export class ConatChangefeed extends EventEmitter {
  private account_id: string;
  private query;
  private options;
  private state: "disconnected" | "connected" | "closed" = "disconnected";
  private cf?: Changefeed;

  constructor({
    account_id,
    query,
    options,
  }: {
    account_id: string;
    query;
    options?;
  }) {
    super();
    this.account_id = account_id;
    this.query = query;
    this.options = options;
  }

  log = (...args) => {
    if (!LOW_LEVEL_DEBUG) return;
    log(this.query, ...args);
  };

  connect = async () => {
    this.log("connecting...");
    this.cf = changefeed({
      client: await conat(),
      account_id: this.account_id,
      query: this.query,
      options: this.options,
    });
    const { value, done } = await this.cf.next();
    if (done) {
      this.log("closed before receiving any values");
      this.close();
      return;
    }
    this.log("connected");
    this.state = "connected";
    this.watch();
    return value[Object.keys(value)[0]];
  };

  close = (): void => {
    this.log("close");
    if (this.state == "closed") {
      return;
    }
    this.cf?.close();
    delete this.cf;
    this.state = "closed";
    this.emit("close"); // yes "close" not "closed" ;-(
  };

  get_state = (): string => {
    return this.state;
  };

  private watch = async () => {
    if (this.cf == null || this.state == "closed") {
      return;
    }
    try {
      for await (const x of this.cf) {
        // this.log("got message ", x);
        // @ts-ignore
        if (this.state == "closed") {
          return;
        }
        this.emit("update", x);
      }
    } catch (err) {
      this.log("got error", err);
    }
    this.log("watch ended", this.query);
    this.close();
  };
}
