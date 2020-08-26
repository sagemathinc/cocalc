/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this manages the webapp's configuration based on the hostname (allows whitelabeling)

import { parseDomain, ParseResultType } from "parse-domain";
//import * as lodash from "lodash";
import * as debug from "debug";
const L = debug("hub:webapp-config");
import { callback2 as cb2 } from "../smc-util/async-utils";
import { PostgreSQL } from "./postgres/types";
const server_settings = require("./server-settings");
//import { get_server_settings } from "./utils";
import { EXTRAS as SERVER_SETTINGS_EXTRAS } from "smc-util/db-schema/site-settings-extras";
import { site_settings_conf as SITE_SETTINGS_CONF } from "smc-util/schema";
//import { ThemeKeys } from "smc-util/db-schema/site-whitelabeling";

type Theme = { [key: string]: string | boolean };

export class WebappConfiguration {
  readonly db: PostgreSQL;
  private data: any;

  constructor({ db }) {
    this.db = db;
    this.data = server_settings(this.db);
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
    //const base = lodash.pick(await get_server_settings(this.db), ThemeKeys);
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

  public async get(req) {
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
