import json from "json-stable-stringify";
import { EventEmitter } from "events";
import type { JSONValue } from "@cocalc/util/types";
import { ConatError } from "@cocalc/conat/core/client";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("monitor:usage");

interface Options {
  resource: string;
  maxPerUser?: number;
  max?: number;
}

export class UsageMonitor extends EventEmitter {
  private options: Options;
  private total = 0;
  private perUser: { [user: string]: number } = {};

  constructor(options: Options) {
    super();
    this.options = options;
    logger.debug("creating usage monitor", this.options);
  }

  close = () => {
    this.removeAllListeners();
    this.perUser = {};
  };

  private toJson = (user: JSONValue) => json(user) ?? "";

  add = (user: JSONValue) => {
    const u = this.toJson(user);
    let count = this.perUser[u] ?? 0;
    if (this.options.max && this.total >= this.options.max) {
      this.emit("deny", user, this.options.max, "global");
      throw new ConatError(
        `There is a global limit of ${this.options.max} ${this.options.resource}.   Please close browser tabs or files or come back later.`,
        // http error code "429 Too Many Requests."
        { code: 429 },
      );
    }
    if (this.options.maxPerUser && count >= this.options.maxPerUser) {
      this.emit("deny", this.options.maxPerUser, "per-user");
      throw new ConatError(
        `There is a per user limit of ${this.options.maxPerUser} ${this.options.resource}.   Please close browser tabs or files or come back later.`,
        // http error code "429 Too Many Requests."
        { code: 429 },
      );
    }
    this.total += 1;
    count++;
    this.perUser[u] = count;
    this.emit("total", this.total, this.options.max);
    this.emit("add", user, count, this.options.maxPerUser);
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
