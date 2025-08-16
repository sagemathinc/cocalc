/*
This is a really simple but incredibly useful little class.
See packages/project/conat/terminal.ts for how to use it to make
it so the terminal sends output at a rate of say "24 frames
per second".

This could also be called "buffering"...
*/
import { EventEmitter } from "events";

const DEFAULT_MESSAGES_PER_SECOND = 24;

// Throttling a string where use "+" to add more to our buffer
export class ThrottleString extends EventEmitter {
  private buf: string = "";
  private last = Date.now();
  private interval: number;

  constructor(messagesPerSecond: number = DEFAULT_MESSAGES_PER_SECOND) {
    super();
    this.interval = 1000 / messagesPerSecond;
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

// Throttle a list of objects, where push them into an array to add more to our buffer.
export class Throttle<T> extends EventEmitter {
  private buf: T[] = [];
  private last = Date.now();
  private interval: number;

  constructor(messagesPerSecond: number = DEFAULT_MESSAGES_PER_SECOND) {
    super();
    this.interval = 1000 / messagesPerSecond;
  }

  // if you want data to be sent be sure to flush before closing
  close = () => {
    this.removeAllListeners();
    this.buf.length = 0;
  };

  write = (data: T) => {
    this.buf.push(data);
    this.update();
  };

  private update = () => {
    const now = Date.now();
    const timeUntilEmit = this.interval - (now - this.last);
    if (timeUntilEmit > 0) {
      setTimeout(() => this.update(), timeUntilEmit);
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
