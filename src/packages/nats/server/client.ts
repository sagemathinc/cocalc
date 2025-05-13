/*

c = require("@cocalc/nats/server/client").client(); 
s=await c.subscribe('foo'); 
for await (const x of s) { console.log(x.length)}

*/

import { connect } from "socket.io-client";
import { EventIterator } from "event-iterator";
import type { ServerInfo } from "./types";

export class Client {
  private conn: ReturnType<typeof connect>;
  private subscriptions: { [subject: string]: number } = {};
  public info: ServerInfo | undefined = undefined;

  constructor(address: string) {
    this.conn = connect(address);
    this.conn.on("info", (info) => {
      this.info = info;
    });
  }

  subscribe = async (subject: string): Promise<Subscription<any>> => {
    const cur = this.subscriptions[subject] ?? 0;
    if (cur == 0) {
      this.conn.emit("subscribe", { subject });
      // todo confirmation/security
    }
    this.subscriptions[subject] = cur + 1;
    const iter = new EventIterator(({ push }) => {
      this.conn.on(subject, push);
      return () => {
        this.conn.off(subject, push);
        this.subscriptions[subject] -= 1;
        if (this.subscriptions[subject] <= 0) {
          this.conn.emit("unsubscribe", { subject });
        }
      };
    });
    const f = async function* () {
      for await (const x of iter) {
        yield x;
      }
    };
    return new Subscription(f());
  };

  publish = (subject: string, data) => {
    this.conn.emit("publish", { subject, data });
  };
}

export function client(address: string = "http://localhost:3000") {
  return new Client(address);
}

class Subscription<T> implements AsyncIterableIterator<T> {
  private iter: AsyncIterableIterator<T>;
  private stopped = false;

  constructor(iter: AsyncIterableIterator<T>) {
    this.iter = iter;
  }

  async next(...args: [] | [any]) {
    if (this.stopped) {
      return { done: true as true, value: undefined };
    }
    const result = await this.iter.next(...args);
    // Don't yield further values after stopped:
    if (this.stopped) {
      return { done: true as true, value: undefined };
    }
    return result;
  }

  async return(value?: any) {
    this.stopped = true;
    return this.iter.return ? this.iter.return(value) : { done: true, value };
  }

  async throw(e?: any) {
    this.stopped = true;
    return this.iter.throw ? this.iter.throw(e) : Promise.reject(e);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  stop() {
    if (!this.stopped) {
      this.stopped = true;
      this.return();
    }
  }
}
