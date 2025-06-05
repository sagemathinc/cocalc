import { SOCKET_HEADER_SEQ, type Role } from "./util";
import { EventEmitter } from "events";
import {
  type Message,
  messageData,
  type MessageData,
} from "@cocalc/conat/core/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";

const DEFAULT_TIMEOUT = 2 * 60 * 1000;

export interface TCP {
  send: Sender;
  recv: Receiver;
}

export function createTCP({ request, send, reset, role }): TCP {
  return {
    send: new Sender(send, role),
    recv: new Receiver(request, reset, role),
  };
}

export class Receiver extends EventEmitter {
  private incoming: { [id: number]: MessageData } = {};
  private seq: {
    // next = seq of the next message we should emit
    next: number;
    // emitted = seq of the last message we actually did emit
    emitted: number;
    // reported = seq of last message we reported received to caller
    reported: number;
    // largest = largest seq of any message we have received
    largest: number;
  } = { next: 1, emitted: 0, reported: 0, largest: 0 };

  constructor(
    private request,
    private reset,
    public readonly role: Role,
  ) {
    super();
  }

  close = () => {
    this.removeAllListeners();
    // @ts-ignore
    delete this.incoming;
    // @ts-ignore
    delete this.seq;
  };

  process = (mesg: MessageData) => {
    const seq = mesg.headers?.[SOCKET_HEADER_SEQ];
    // console.log(this.role, "recv", { data: mesg.data, seq });
    if (typeof seq != "number" || seq < 1) {
      console.log(
        `WARNING: ${this.role} discarding message -- seq must be a positive integer`,
        { seq, mesg: mesg.data, headers: mesg.headers },
      );
      return;
    }
    this.seq.largest = Math.max(seq, this.seq.largest);
    // console.log("process", { seq, next: this.seq.next });
    if (seq == this.seq.next) {
      this.emitMessage(mesg, seq);
    } else if (seq > this.seq.next) {
      // in the future -- save until we get this.seq.next:
      this.incoming[seq] = mesg;
      // console.log("doing fetchMissing because: ", { seq, next: this.seq.next });
      this.fetchMissing();
    }
  };

  emitMessage = (mesg, seq) => {
    if (seq != this.seq.next) {
      throw Error("message sequence is wrong");
    }
    this.seq.next = seq + 1;
    this.seq.emitted = seq;
    delete mesg.headers?.[SOCKET_HEADER_SEQ];
    //     console.log("emitMessage", mesg.data, {
    //       seq,
    //       next: this.seq.next,
    //       emitted: this.seq.emitted,
    //     });
    this.emit("message", mesg);
    this.reportReceived();
  };

  fetchMissing = reuseInFlight(async () => {
    const missing: number[] = [];
    for (let seq = this.seq.next; seq <= this.seq.largest; seq++) {
      if (this.incoming[seq] === undefined) {
        missing.push(seq);
      }
    }
    if (missing.length == 0) {
      return;
    }
    missing.sort();
    let resp;
    try {
      resp = await this.request({ socket: { missing } });
    } catch (err) {
      // 503 happens when the other side is temporarily not available
      //       if (err.code != 503) {
      //         console.log("WARNING: error requesting missing messages", missing, err);
      //       }
      return;
    }
    if (this.seq == null) {
      return;
    }
    if (resp.headers?.error) {
      // missing data doesn't exist -- must reset
      this.reset();
      return;
    }
    // console.log("got missing", resp.data);
    for (const x of resp.data) {
      this.process(messageData(null, x));
    }
    this.emitIncoming();
  });

  emitIncoming = () => {
    // also emit any incoming that comes next
    let seq = this.seq.next;
    while (this.incoming[seq] != null && this.seq != null) {
      const mesg = this.incoming[seq];
      delete this.incoming[seq];
      this.emitMessage(mesg, seq);
      seq += 1;
    }
    this.reportReceived();
  };

  reportReceived = async () => {
    if (this.seq.reported >= this.seq.emitted) {
      // nothing to report
      return;
    }
    const x = { socket: { emitted: this.seq.emitted } };
    try {
      await this.request(x);
      if (this.seq == null) {
        return;
      }
      this.seq.reported = x.socket.emitted;
    } catch {
      // When things are broken this should throw, and the natura of tcp is that
      // things should sometimes be broken.
    }
  };
}

export class Sender {
  private outgoing: { [id: number]: Message } = {};
  private seq = 0;
  timeout = DEFAULT_TIMEOUT;

  constructor(
    private send: (mesg: Message) => void,
    public readonly role: Role,
  ) {}

  close = () => {
    // @ts-ignore
    delete this.outgoing;
    // @ts-ignore
    delete this.seq;
  };

  process = (mesg) => {
    this.seq += 1;
    // console.log("Sender.process", mesg.data, this.seq);
    this.outgoing[this.seq] = mesg;
    mesg.headers = { ...mesg.headers, [SOCKET_HEADER_SEQ]: this.seq };
    // console.log(this.role, "send", { data: mesg.data, seq: this.seq });
    this.send(mesg);
  };

  private lastAcked = (): boolean => {
    return this.seq == 0 || this.outgoing[this.seq] === undefined;
  };

  // if socket is suspicious that the most recently sent message may
  // have been dropped, they call this.  If indeed it was not acknowledged,
  // the last message will get sent again, which also will trigger the
  // other side of the socket to fetch anything else that it did not receive.
  private resendLast = () => {
    if (this.lastAcked()) {
      // console.log("resendLast -- nothing to do");
      // no-op
    }
    // console.log("resendLast -- resending");
    this.send(this.outgoing[this.seq]);
  };

  resendLastUntilAcked = reuseInFlight(async () => {
    const end = Date.now() + this.timeout;
    let d = 500;
    while (
      this.outgoing !== undefined &&
      !this.lastAcked() &&
      Date.now() < end
    ) {
      this.resendLast();
      d = Math.min(Date.now() - end, Math.min(15000, d * 1.3));
      await delay(d);
    }
  });

  handleRequest = (mesg) => {
    if (mesg.data?.socket == null || this.seq == null) {
      return;
    }
    const { emitted, missing } = mesg.data.socket;
    if (emitted != null) {
      for (const id in this.outgoing) {
        if (parseInt(id) <= emitted) {
          delete this.outgoing[id];
        }
      }
      mesg.respondSync({ emitted });
    } else if (missing != null) {
      const v: Message[] = [];
      for (const id of missing) {
        const x = this.outgoing[id];
        if (x == null) {
          // the data does not exist on this client.  This should only happen, e.g.,
          // on automatic failover with the sticky load balancer... ?
          mesg.respondSync(null, { headers: { error: "nodata" } });
          return;
        }
        v.push(x);
      }
      //console.log("sending missing", v);
      mesg.respondSync(v);
    }
  };
}
