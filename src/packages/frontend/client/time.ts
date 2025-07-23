/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getTime, { getLastSkew, getLastPingTime } from "@cocalc/conat/time";

const PING_INTERVAL_MS = 10000;

export class TimeClient {
  private client;
  private closed: boolean = false;
  private interval;
  private lastPingtime: number | null = null;

  constructor(client: any) {
    this.client = client;
    this.interval = setInterval(this.emitPingTime, PING_INTERVAL_MS);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    if (this.interval) {
      clearInterval(this.interval);
      delete this.interval;
    }
    this.closed = true;
  }

  // everything related to sync should directly use conat getTime, which
  // throws an error if it doesn't know the correct server time.
  server_time = (): Date => {
    try {
      return new Date(getTime());
    } catch {
      return new Date();
    }
  };

  private emitPingTime = () => {
    if (!window.document.hasFocus()) {
      // console.log("latency: not in focus")
      return;
    }
    const ping = getLastPingTime();
    if (ping == null || ping == this.lastPingtime) {
      return;
    }
    this.lastPingtime = ping;
    // networking/pinging slows down a lot when browser not in focus...
    if (ping > 10000) {
      // console.log("ping: discarding huge ping", ping)
      // We get some ridiculous values from Primus when the browser
      // tab gains focus after not being in focus for a while (say on ipad but on many browsers)
      // that throttle.  Just discard them, since otherwise they lead to ridiculous false
      // numbers displayed in the browser.
      return;
    }
    this.client.emit("ping", ping, getLastSkew());
  };
}
