import { EventEmitter } from "events";
import json from "json-stable-stringify";

import { getLogger } from "@cocalc/conat/client";
import { ConatError } from "@cocalc/conat/core/client";
import type { JSONValue } from "@cocalc/util/types";
import { Metrics } from "../types";

const logger = getLogger("monitor:usage");

interface Options {
  resource: string;
  maxPerUser?: number;
  max?: number;
  log?: (...args) => void;
}

export class UsageMonitor extends EventEmitter {
  private options: Options;
  private total = 0;
  private perUser: { [user: string]: number } = {};
  // metrics will be picked up periodically and exposed via e.g. prometheus
  private countDeny = 0;
  private metrics: Metrics = {};

  constructor(options: Options) {
    super();
    this.options = options;
    logger.debug("creating usage monitor", this.options);
    this.initLogging();
  }

  stats = () => {
    return { total: this.total, perUser: this.perUser };
  };

  close = () => {
    this.removeAllListeners();
    this.perUser = {};
  };

  private toJson = (user: JSONValue) => json(user) ?? "";

  private initLogging = () => {
    const { log } = this.options;

    // Record metrics for all events (even if logging is disabled)
    this.on("total", (total, limit) => {
      this.metrics["total:count"] = total;
      this.metrics["total:limit"] = limit;
      if (log) {
        log("usage", this.options.resource, { total, limit });
      }
    });
    this.on("add", (user, count, limit) => {
      // this.metrics["add:count"] = count;
      // this.metrics["add:limit"] = limit;
      if (log) {
        log("usage", this.options.resource, "add", { user, count, limit });
      }
    });
    this.on("delete", (user, count, limit) => {
      // this.metrics["delete:count"] = count;
      // this.metrics["delete:limit"] = limit;
      if (log) {
        log("usage", this.options.resource, "delete", { user, count, limit });
      }
    });
    this.on("deny", (user, limit, type) => {
      this.countDeny += 1;
      this.metrics["deny:count"] = this.countDeny;
      this.metrics["deny:limit"] = limit;
      if (log) {
        log(
          "usage",
          this.options.resource,
          "not allowed due to hitting limit",
          {
            type,
            user,
            limit,
          },
        );
      }
    });
  };

  // we return a copy
  getMetrics = () => {
    return { ...this.metrics };
  };

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
    if (count <= 0) {
      delete this.perUser[u];
    } else {
      this.perUser[u] = count;
    }
    this.emit("total", this.total);
    this.emit("delete", user, count);
  };
}
