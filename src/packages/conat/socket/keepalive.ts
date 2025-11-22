import { delay } from "awaiting";
import { type Role } from "./util";

export function keepAlive(opts: {
  role: Role;
  ping: () => Promise<any>;
  disconnect: () => void;
  keepAlive: number;
}) {
  return new KeepAlive(opts.ping, opts.disconnect, opts.keepAlive, opts.role);
}

export class KeepAlive {
  private last: number = Date.now();
  private state: "ready" | "closed" = "ready";

  constructor(
    private ping: () => Promise<any>,
    private disconnect: () => void,
    private keepAlive: number,
    // @ts-ignore
    private role: Role,
  ) {
    this.run();
  }

  private run = async () => {
    while (this.state == "ready") {
      try {
        //console.log(this.role, "keepalive -- sending ping");
        await this.ping?.();
      } catch (err) {
        //console.log(this.role, "keepalive -- ping failed -- disconnecting");
        this.disconnect?.();
        this.close();
        return;
      }
      this.last = Date.now();
      if (this.state == ("closed" as any)) {
        return;
      }
      await delay(this.keepAlive - (Date.now() - this.last));
    }
  };

  // call this when any data is received, which defers having to waste resources on
  // sending a ping
  recv = () => {
    this.last = Date.now();
  };

  close = () => {
    this.state = "closed";
    // @ts-ignore
    delete this.last;
    // @ts-ignore
    delete this.ping;
    // @ts-ignore
    delete this.disconnect;
  };
}
