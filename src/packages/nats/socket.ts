/*
Implement a websocket as exposed in Primus over NATS.
*/

import { EventEmitter } from "events";

export class Socket extends EventEmitter {
  private listen: string;
  private send: string;
  private nc;
  private jc;

  constructor({
    listen,
    send,
    nc,
    jc,
  }: {
    // subject to listen on
    listen: string;
    // subject to write to
    send: string;
    // nats connection
    nc;
    // json codec
    jc;
  }) {
    super();
    this.listen = listen;
    this.send = send;
    this.nc = nc;
    this.jc = jc;
    this.startListening();
  }

  private startListening = async () => {
    const sub = this.nc.subscribe(this.listen);
    for await (const mesg of sub) {
      const { data } = this.jc.decode(mesg.data) ?? ({} as any);
      this.emit("data", data);
    }
  };

  write(data) {
    this.nc.publish(this.send, this.jc.encode({ data }));
  }
}
