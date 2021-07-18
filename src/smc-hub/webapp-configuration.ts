/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This unifies the entire webapp configuration – endpoint /customize
// The main goal is to optimize this, to use as little DB interactions
// as necessary, use caching, etc.
// This manages the webapp's configuration based on the hostname
// (allows whitelabeling).

import { parseDomain, ParseResultType } from "parse-domain";
import * as debug from "debug";
const L = debug("hub:webapp-config");
import { delay } from "awaiting";
import { callback2 as cb2 } from "smc-util/async-utils";
import { PostgreSQL } from "./postgres/types";
import { PassportManager, get_passport_manager } from "./auth";
import getServerSettings from "./servers/server-settings";
import { EXTRAS as SERVER_SETTINGS_EXTRAS } from "smc-util/db-schema/site-settings-extras";
import { site_settings_conf as SITE_SETTINGS_CONF } from "smc-util/schema";
import { have_active_registration_tokens } from "./utils";

import * as LRUCache from "lru-cache";
const CACHE = new LRUCache({ max: 10, maxAge: 3 * 60 * 1000 }); // 3 minutes

export function clear_cache(): void {
  CACHE.reset();
}

type Theme = { [key: string]: string | boolean };

interface Config {
  // todo
  configuration: any;
  registration: any;
  strategies: object;
}

async function get_passport_manager_async(): Promise<PassportManager> {
  // the only issue here is, that the http server already starts up before the
  // passport manager is configured – but, the passport manager depends on the http server
  // we just retry during that initial period of uncertainty…
  while (true) {
    const pp_manager = get_passport_manager();
    if (pp_manager != null) {
      return pp_manager;
    } else {
      L(`Passport Manager not available yet -- trying again in 100ms`);
      await delay(100);
    }
  }
}

// these are special values, but can be overwritten by the specific theme
const VANITY_HARDCODED = {
  allow_anonymous_sign_in: false,
  //kucalc: "onprem", // TODO: maybe do this, not sure
  //commercial: false,
} as const;

export class WebappConfiguration {
  private readonly db: PostgreSQL;
  private data?: any;
  private passport_manager: PassportManager;

  constructor({ db }) {
    this.db = db;
    this.init();
  }

  private async init(): Promise<void> {
    // this.data.pub updates automatically – do not modify it!
    this.data = await getServerSettings();
    this.passport_manager = await get_passport_manager_async();
  }

  // server settings with whitelabeling settings
  // TODO post-process all values
  public async settings(vid: string) {
    const res = await cb2(this.db._query, {
      query: "SELECT id, settings FROM whitelabeling",
      cache: true,
      where: { "id = $::TEXT": vid },
    });
    if (this.data == null) {
      // settings not yet initialized
      return {};
    }
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
    if (this.data == null) {
      // settings not yet initialized
      return {};
    }
    const vid = this.get_vanity_id(host);
    const config = this.data.pub;
    const vanity = this.get_vanity(vid);
    return { ...config, ...vanity, ...{ country, dns: host } };
  }

  private get_strategies(): object {
    const key = "strategies";
    let strategies = CACHE.get(key);
    if (strategies == null) {
      strategies = this.passport_manager.get_strategies_v2();
      CACHE.set(key, strategies);
    }
    return strategies as object;
  }

  private async get_config({ country, host }): Promise<Config> {
    const [configuration, registration] = await Promise.all([
      this.get_configuration({ host, country }),
      have_active_registration_tokens(this.db),
    ]);
    const strategies = this.get_strategies();
    return { configuration, registration, strategies };
  }

  // it returns a shallow copy, hence you can modify/add keys in the returned map!
  public async get({ country, host }): Promise<Config> {
    const key = `config::${country}::${host}`;
    let config = CACHE.get(key);
    if (config == null) {
      config = await this.get_config({ country, host });
      CACHE.set(key, config);
    } else {
      L(`cache hit -- '${key}'`);
    }
    return config as Config;
  }
}
