/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this manages the webapp's configuration based on the hostname (allows whitelabeling)

import { parseDomain, ParseResultType } from "parse-domain";
import * as debug from "debug";
const L = debug("hub:webapp-config");
import { callback2 as cb2 } from "../smc-util/async-utils";
import { PostgreSQL } from "./postgres/types";
const server_settings = require("./server-settings");
import { EXTRAS as SERVER_SETTINGS_EXTRAS } from "smc-util/db-schema/site-settings-extras";
import { site_settings_conf as SITE_SETTINGS_CONF } from "smc-util/schema";

type Theme = { [key: string]: string | boolean };

export class WhitelabelConfiguration {
  readonly db: PostgreSQL;
  private data: any;

  constructor({ db }) {
    this.db = db;
    this.data = server_settings(this.db);
  }

  // server settings with whitelabeling settings
  // TODO post-process all values
  public async settings(vid: string) {
    const res = await cb2(this.db._query, {
      query: "SELECT id, settings FROM whitelabeling",
      cache: true,
      where: { "id = $::TEXT": vid },
    });
    const data = res.rows[0];
    if (data != null) {
      return { ...this.data.all, ...data.settings };
    } else {
      return this.data.all;
    }
  }

  // derive the vanity ID from the host string
  private vanity(host: string): string | undefined {
    const host_parsed = parseDomain(host);
    if (host_parsed.type === ParseResultType.Listed) {
      // vanity for vanity.cocalc.com or foo.p for foo.p.cocalc.com
      return host_parsed.subDomains.join(".");
    }
    return undefined;
  }

  private async theme(vid: string): Promise<Theme> {
    const res = await cb2(this.db._query, {
      query: "SELECT id, theme FROM whitelabeling",
      cache: true,
      where: { "id = $::TEXT": vid },
    });
    const data = res.rows[0];
    if (data != null) {
      // post-process data, but do not set default values…
      const theme: Theme = {};
      for (const [key, value] of Object.entries(data.theme)) {
        const config = SITE_SETTINGS_CONF[key] ?? SERVER_SETTINGS_EXTRAS[key];
        if (typeof config?.to_val == "function") {
          theme[key] = config.to_val(value);
        } else {
          if (typeof value == "string" || typeof value == "boolean") {
            theme[key] = value;
          }
        }
      }
      L(`vanity theme=${JSON.stringify(theme)}`);
      return theme;
    } else {
      L(`theme id=${vid} not found`);
      return {};
    }
  }

  public async webapp(req) {
    const host = req.headers["host"];
    const vid = this.vanity(host);
    L(`vanity ID = "${vid}"`);
    if (vid != null) {
      // these are special values, but can be overwritten by the specific theme
      const hardcoded = {
        dns: host,
        allow_anonymous_sign_in: false,
        //kucalc: "onprem", // TODO: maybe do this, not sure
        //commercial: false,
      };
      return { ...this.data.pub, ...hardcoded, ...(await this.theme(vid)) };
    } else {
      // the default
      return this.data.pub;
    }
  }
}
