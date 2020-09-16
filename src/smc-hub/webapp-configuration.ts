/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this unifies the entire webapp configuration – endpoint /customize?type=full
// the main goal is to optimize this, to use as little DB interactions as necessary, use caching, etc.

// this manages the webapp's configuration based on the hostname (allows whitelabeling)

import { parseDomain, ParseResultType } from "parse-domain";
import * as debug from "debug";
const L = debug("hub:webapp-config");
import { callback2 as cb2 } from "../smc-util/async-utils";
import { PostgreSQL } from "./postgres/types";
const server_settings = require("./server-settings");
import { EXTRAS as SERVER_SETTINGS_EXTRAS } from "smc-util/db-schema/site-settings-extras";
import { site_settings_conf as SITE_SETTINGS_CONF } from "smc-util/schema";
import { have_active_registration_tokens } from "./utils";

type Theme = { [key: string]: string | boolean };

// these are special values, but can be overwritten by the specific theme
const VANITY_HARDCODED = {
  allow_anonymous_sign_in: false,
  //kucalc: "onprem", // TODO: maybe do this, not sure
  //commercial: false,
} as const;

export class WebappConfiguration {
  private readonly db: PostgreSQL;
  private readonly data: any;

  constructor({ db }) {
    this.db = db;
    // this.data.pub updates automatically – do not modify it!
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
  private get_vanity_id(host: string): string | undefined {
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

  private async get_vanity(vid): Promise<object> {
    if (vid != null && vid !== "") {
      L(`vanity ID = "${vid}"`);
      return {
        ...VANITY_HARDCODED,
        ...(await this.theme(vid)),
      };
    } else {
      return {};
    }
  }

  // returns the global configuration + eventually vanity specific site config settings
  private async get_configuration({ host, country }) {
    const vid = this.get_vanity_id(host);
    const config = this.data.pub;
    const vanity = this.get_vanity(vid);
    return { ...config, ...vanity, ...{ country, dns: host } };
  }

  // it returns a shallow copy, hence you can modify/add keys in the returned map!
  public async get({ country, host }) {
    const [configuration, registration] = await Promise.all([
      this.get_configuration({ host, country }),
      have_active_registration_tokens(this.db),
    ]);
    return { configuration, registration };
  }
}
