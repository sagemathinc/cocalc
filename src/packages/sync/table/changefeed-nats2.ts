/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { changefeed, renew } from "@cocalc/nats/changefeed/client";
import { delay } from "awaiting";

const HEARTBEAT = 7500;

export class NatsChangefeed extends EventEmitter {
  private account_id: string;
  private query;
  private options;
  private state: "disconnected" | "connected" | "closed" = "disconnected";
  private natsSynctable?;
  private last_hb = 0;
  private id?: string;
  private lifetime?: number;

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
      heartbeat: HEARTBEAT,
    });
    this.last_hb = Date.now();
    // @ts-ignore
    if (this.state == "closed") return;
    this.state = "connected";
    const {
      value: { id, lifetime },
    } = await this.natsSynctable.next();
    this.id = id;
    this.lifetime = lifetime;
    console.log("got changefeed", { id, lifetime });
    this.startRenewLoop();

    // @ts-ignore
    while (this.state != "closed") {
      const { value } = await this.natsSynctable.next();
      this.last_hb = Date.now();
      if (value) {
        // got first non-heartbeat value (the first query might take LONGER than heartbeats)
        this.startWatch();
        this.startHeartbeatMonitor();
        return value[Object.keys(value)[0]];
      }
    }
  };

  close = (): void => {
    if (this.state == "closed") {
      return;
    }
    this.kill();
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
        this.last_hb = Date.now();
        if (x) {
          this.emit("update", x);
        }
      }
    } catch {
      this.close();
    }
  };

  private startHeartbeatMonitor = async () => {
    while (this.state != "closed") {
      if (this.last_hb && Date.now() - this.last_hb > 2 * HEARTBEAT) {
        this.close();
        return;
      }
      await delay(HEARTBEAT / 2);
    }
  };

  // try to free resources on the server
  private kill = async () => {
    if (this.id) {
      try {
        await renew({
          account_id: this.account_id,
          id: this.id,
          lifetime: -1,
        });
      } catch {}
    }
  };

  private startRenewLoop = async () => {
    while (this.state != "closed" && this.lifetime && this.id) {
      await delay(this.lifetime / 3);
      try {
        await renew({
          account_id: this.account_id,
          id: this.id,
          lifetime: this.lifetime,
        });
      } catch {}
    }
  };
}
