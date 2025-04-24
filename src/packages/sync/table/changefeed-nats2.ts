/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { changefeed } from "@cocalc/nats/changefeed/client";

export class NatsChangefeed extends EventEmitter {
  private account_id: string;
  private query;
  private options;
  private state: "disconnected" | "connected" | "closed" = "disconnected";
  private natsSynctable?;

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

  connect = async () => {
    if (this.state == "closed") return;
    this.natsSynctable = await changefeed({
      account_id: this.account_id,
      query: this.query,
      options: this.options,
    });
    // @ts-ignore
    if (this.state == "closed") return;
    this.state = "connected";
    const { value } = await this.natsSynctable.next();
    this.startWatch();
    return value[Object.keys(value)[0]];
  };

  close = (): void => {
    if (this.state == "closed") {
      return;
    }
    // TODO: not sure how to cancel -- not implemented yet
    //this.natsSynctable?.close();
    this.state = "closed";
    this.emit("close"); // yes "close" not "closed" ;-(
  };

  get_state = (): string => {
    return this.state;
  };

  private startWatch = async () => {
    if (this.natsSynctable == null || this.state == "closed") {
      return;
    }
    try {
      for await (const x of this.natsSynctable) {
        // @ts-ignore
        if (this.state == "closed") {
          return;
        }
        this.emit("update", x);
      }
    } catch {
      this.close();
    }
  };
}
