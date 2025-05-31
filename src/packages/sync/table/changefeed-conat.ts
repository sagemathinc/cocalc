/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { changefeed, renew } from "@cocalc/conat/changefeed/client";
import { delay } from "awaiting";
import { waitUntilConnected } from "@cocalc/conat/util";

const LIFETIME = 60000;
const HEARTBEAT = 15000;
const HEARTBEAT_MISS_THRESH = 7500;

// const LIFETIME = 10000;
// const HEARTBEAT = 5000;
// const HEARTBEAT_MISS_THRESH = 4000;

// this should be significantly shorter than HEARTBEAT.
// if user closes browser and comes back, then this is the time they may have
// to wait for their changefeeds to reconnect, since clock jumps forward...
const HEARTBEAT_CHECK_DELAY = 3000;

const MAX_CHANGEFEED_LIFETIME = 1000 * 60 * 60 * 8;

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
  private conatSyncTable?;
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
    log("creating new changefeed", this.query);
    if (this.state == "closed") return;
    this.conatSyncTable = await changefeed({
      account_id: this.account_id,
      query: this.query,
      options: this.options,
      heartbeat: HEARTBEAT,
      maxActualLifetime: MAX_CHANGEFEED_LIFETIME,
      lifetime: LIFETIME,
    });
    // @ts-ignore
    if (this.state == "closed") return;
    this.last_hb = Date.now();
    this.startHeartbeatMonitor();
    this.state = "connected";
    const {
      value: { id, lifetime },
    } = await this.conatSyncTable.next();
    this.id = id;
    this.lifetime = lifetime;
    log("got changefeed", { id, lifetime, query: this.query });
    this.startRenewLoop();

    // @ts-ignore
    while (this.state != "closed") {
      const { value } = await this.conatSyncTable.next();
      this.last_hb = Date.now();
      if (value) {
        this.startWatch();
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
    log("firing close event for ", this.query);
    this.emit("close"); // yes "close" not "closed" ;-(
  };

  get_state = (): string => {
    return this.state;
  };

  private startWatch = async () => {
    if (this.conatSyncTable == null || this.state == "closed") {
      return;
    }
    try {
      for await (const x of this.conatSyncTable) {
        // @ts-ignore
        if (this.state == "closed") {
          return;
        }
        this.last_hb = Date.now();
        if (x) {
          log("got message ", this.query, x);
          this.emit("update", x);
        } else {
          log("got heartbeat", this.query);
        }
      }
    } catch {
      this.close();
    }
  };

  private startHeartbeatMonitor = async () => {
    while (this.state != "closed") {
      await delay(HEARTBEAT_CHECK_DELAY);
      await waitUntilConnected();
      // @ts-ignore
      if (this.state == "closed") {
        return;
      }
      if (
        this.last_hb &&
        Date.now() - this.last_hb > HEARTBEAT + HEARTBEAT_MISS_THRESH
      ) {
        log("heartbeat failed", this.query, {
          last_hb: this.last_hb,
          diff: Date.now() - this.last_hb,
          thresh: HEARTBEAT + HEARTBEAT_MISS_THRESH,
        });
        this.close();
        return;
      }
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
      // max to avoid weird situation bombarding server or infinite loop
      await delay(Math.max(7500, this.lifetime / 3));
      log("renewing with lifetime ", this.lifetime, this.query);
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
