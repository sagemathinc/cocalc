/*
This is a really simple but incredibly useful little class.
See packages/project/conat/terminal.ts for how to use it to make
it so the terminal sends output at a rate of say "24 frames
per second".
*/
import { EventEmitter } from "events";

export class ThrottleString extends EventEmitter {
  private buf: string = "";
  private last = Date.now();

  constructor(private interval: number) {
    super();
  }

  write = (data: string) => {
    this.buf += data;
    const now = Date.now();
    const timeUntilEmit = this.interval - (now - this.last);
    if (timeUntilEmit > 0) {
      setTimeout(() => this.write(""), timeUntilEmit);
    } else {
      this.flush();
    }
  };

  flush = () => {
    if (this.buf.length > 0) {
      this.emit("data", this.buf);
    }
    this.buf = "";
    this.last = Date.now();
  };
}

export class ThrottleAny extends EventEmitter {
  private buf: any[] = [];
  private last = Date.now();

  constructor(private interval: number) {
    super();
  }

  write = (data: any) => {
    this.buf.push(data);
    const now = Date.now();
    const timeUntilEmit = this.interval - (now - this.last);
    if (timeUntilEmit > 0) {
      setTimeout(() => this.write([]), timeUntilEmit);
    } else {
      this.flush();
    }
  };

  flush = () => {
    if (this.buf.length > 0) {
      this.emit("data", this.buf);
    }
    this.buf = [];
    this.last = Date.now();
  };
}
