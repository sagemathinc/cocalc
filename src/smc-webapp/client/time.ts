import { delay } from "awaiting";

import { get_local_storage, set_local_storage } from "smc-util/misc";
import * as message from "smc-util/message";

export class TimeClient {
  private client: any;
  private ping_interval_ms: number = 30000; // interval in ms between pings
  private last_ping: Date = new Date(0);
  private last_pong?: { server: Date; local: Date };
  private clock_skew_ms?: number;
  private last_server_time?: Date;
  private closed : boolean = false;

  constructor(client: any) {
    this.client = client;
  }

  close() : void {
    this.closed = true;
  }

  // Starts pinging going.
  public async ping(): Promise<void> {
    if (this.closed) return;
    const start = (this.last_ping = new Date());
    let pong;
    try {
      pong = await this.client.async_call({
        allow_post: false,
        message: message.ping(),
        timeout: 10, // CRITICAL that this timeout be less than the @_ping_interval
      });
    } catch (err) {
      // try again **sooner**
      setTimeout(this.ping.bind(this), this.ping_interval_ms / 2);
      return;
    }
    const now = new Date();
    // Only record something if success, got a pong, and the round trip is short!
    // If user messes with their clock during a ping and we don't do this, then
    // bad things will happen.
    if (
      pong?.event == "pong" &&
      now.valueOf() - this.last_ping.valueOf() <= 1000 * 15
    ) {
      if (pong.now == null) {
        throw Error("png must have a now field");
      }
      this.last_pong = { server: pong.now, local: now };
      // See the function server_time below; subtract this.clock_skew_ms from local
      // time to get a better estimate for server time.
      this.clock_skew_ms =
        this.last_ping.valueOf() +
        (this.last_pong.local.valueOf() - this.last_ping.valueOf()) / 2 -
        this.last_pong.server.valueOf();
      set_local_storage("clock_skew", this.clock_skew_ms);
    }

    this.emit_latency(now.valueOf() - start.valueOf());

    // try again later
    setTimeout(this.ping.bind(this), this.ping_interval_ms);
  }

  private emit_latency(latency: number) {
    if (!window.document.hasFocus()) {
      // console.log("latency: not in focus")
      return;
    }
    // networking/pinging slows down when browser not in focus...
    if (latency > 10000) {
      // console.log("latency: discarding huge latency", latency)
      // We get some ridiculous values from Primus when the browser
      // tab gains focus after not being in focus for a while (say on ipad but on many browsers)
      // that throttle.  Just discard them, since otherwise they lead to ridiculous false
      // numbers displayed in the browser.
      return;
    }
    this.client.emit("ping", latency, this.clock_skew_ms);
  }

  // Returns (approximate) time in ms since epoch on the server.
  // NOTE:
  //     This is guaranteed to be an *increasing* function, with an arbitrary
  //     ms added on in case of multiple calls at once, to guarantee uniqueness.
  //     Also, if the user changes their clock back a little, this will still
  //     increase... very slowly until things catch up.  This avoids any
  //     possibility of weird random re-ordering of patches within a given session.
  public server_time(): Date {
    let t = this.unskewed_server_time();
    const last = this.last_server_time;
    if (last != null && last >= t) {
      // That's annoying -- time is not marching forward... let's fake it until it does.
      t = new Date(last.valueOf() + 1);
    }
    this.last_server_time = t;
    return t;
  }

  private unskewed_server_time(): Date {
    // Add clock_skew_ms to our local time to get a better estimate of the actual time on the server.
    // This can help compensate in case the user's clock is wildly wrong, e.g., by several minutes,
    // or even hours due to totally wrong time (e.g. ignoring time zone), which is relevant for
    // some algorithms including sync which uses time.  Getting the clock right up to a small multiple
    // of ping times is fine for our application.
    if (this.clock_skew_ms == null) {
      const x = get_local_storage("clock_skew");
      if (x != null) {
        this.clock_skew_ms = parseFloat(x);
      }
    }
    if (this.clock_skew_ms != null) {
      return new Date(new Date().valueOf() - this.clock_skew_ms);
    } else {
      return new Date();
    }
  }

  public async ping_test(opts: {
    packets?: number;
    timeout?: number; // any ping that takes this long in seconds is considered a fail
    delay_ms?: number; // wait this long between doing pings
    log?: Function; // if set, use this to log output
  }) {
    if (opts.packets == null) opts.packets = 20;
    if (opts.timeout == null) opts.timeout = 5;
    if (opts.delay_ms == null) opts.delay_ms = 200;

    /*
        Use like this in a the console:

            smc.client.time_client.ping_test(delay_ms:100, packets:40, log:print)
        */
    const ping_times: number[] = [];
    async function do_ping(i: number): Promise<void> {
      const t = new Date();
      const heading = `${i}/${opts.packets}: `;
      let bar, mesg, pong, ping_time;
      try {
        pong = await this.client.async_call({
          message: message.ping(),
          timeout: opts.timeout,
        });
        ping_time = new Date().valueOf() - t.valueOf();
        bar = "";
        for (let j = 0; j <= Math.floor(ping_time / 10); j++) {
          bar += "*";
        }
        mesg = `${heading}time=${ping_time}ms`;
      } catch (err) {
        bar = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!";
        mesg = `${heading}Request error -- ${err}, ${JSON.stringify(pong)}`;
        ping_time = Infinity;
      }

      while (mesg.length < 40) {
        mesg += " ";
      }
      mesg += bar;
      if (opts.log != null) {
        opts.log(mesg);
      } else {
        console.log(mesg);
      }
      ping_times.push(ping_time);
      await delay(opts.delay_ms);
    }

    for (let i = 0; i < opts.packets; i++) {
      await do_ping(i);
    }

    return ping_times;
  }
}
