import json from "json-stable-stringify";
import { EventEmitter } from "events";
import type { JSONValue } from "@cocalc/util/types";
import { ConatError } from "@cocalc/conat/core/client";

interface Options {
  resource: string;
  maxPerUser?: number;
}

export class UsageMonitor extends EventEmitter {
  private options: Options;
  private total = 0;
  private perUser: { [user: string]: number } = {};

  constructor(options: Options) {
    super();
    this.options = options;
  }

  private toJson = (user: JSONValue) => json(user) ?? "";

  add = (user: JSONValue) => {
    const u = this.toJson(user);
    let count = this.perUser[u] ?? 0;
    if (this.options.maxPerUser && count >= this.options.maxPerUser) {
      this.emit("deny", user);
      throw new ConatError(
        `There is a limit of ${this.options.maxPerUser} of ${this.options.resource}.  Please close browser tabs or files.`,
        // http error code "429 Too Many Requests."
        { code: 429 },
      );
    }
    this.total += 1;
    count++;
    this.perUser[u] = count;
    this.emit("total", this.total);
    this.emit("add", user, count);
  };

  delete = (user: JSONValue) => {
    this.total -= 1;
    const u = this.toJson(user);
    let count = (this.perUser[u] ?? 0) - 1;
    this.perUser[u] = count;
    this.emit("total", this.total);
    this.emit("delete", user, count);
  };
}
