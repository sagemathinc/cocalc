/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This unifies the entire webapp configuration – endpoint /customize
// The main goal is to optimize this, to use as little DB interactions
// as necessary, use caching, etc.
// This manages the webapp's configuration based on the hostname
// (allows whitelabeling).

import { delay } from "awaiting";
import debug from "debug";
import { isEmpty } from "lodash";
import LRU from "lru-cache";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import { get_passport_manager, PassportManager } from "@cocalc/server/hub/auth";
import { getSoftwareEnvironments } from "@cocalc/server/software-envs";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { EXTRAS as SERVER_SETTINGS_EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { SoftwareEnvConfig } from "@cocalc/util/sanitize-software-envs";
import { site_settings_conf as SITE_SETTINGS_CONF } from "@cocalc/util/schema";
import { CustomLLMPublic } from "@cocalc/util/types/llm";
import { parseDomain, ParseResultType } from "parse-domain";
import getServerSettings, {
  ServerSettingsDynamic,
} from "./servers/server-settings";
import { have_active_registration_tokens } from "./utils";

const L = debug("hub:webapp-config");

const CACHE = new LRU({ max: 1000, ttl: 30 * 1000 }); // 1 minutes

export function clear_cache(): void {
  CACHE.clear();
}

type Theme = { [key: string]: string | boolean };

interface Config {
  // todo
  configuration: any;
  registration: any;
  strategies: object;
  software: SoftwareEnvConfig | null;
  ollama: { [key: string]: CustomLLMPublic };
  custom_openai: { [key: string]: CustomLLMPublic };
}

async function get_passport_manager_async(): Promise<PassportManager> {
  // the only issue here is, that the http server already starts up before the
  // passport manager is configured – but, the passport manager depends on the http server
  // we just retry during that initial period of uncertainty…
  let ms = 100;
  while (true) {
    const pp_manager = get_passport_manager();
    if (pp_manager != null) {
      return pp_manager;
    } else {
      L(
        `WARNING: Passport Manager not available yet -- trying again in ${ms}ms`,
      );
      await delay(ms);
      ms = Math.min(10000, 1.3 * ms);
    }
  }
}

export class WebappConfiguration {
  private readonly db: PostgreSQL;
  private data?: ServerSettingsDynamic;

  constructor({ db }) {
    this.db = db;
    this.init();
  }

  private async init(): Promise<void> {
    // this.data.pub updates automatically – do not modify it!
    this.data = await getServerSettings();
    await get_passport_manager_async();
  }

  // server settings with whitelabeling settings
  // TODO post-process all values
  public async settings(vID: string) {
    const res = await cb2(this.db._query, {
      query: "SELECT id, settings FROM whitelabeling",
      cache: true,
      where: { "id = $::TEXT": vID },
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

  private async theme(vID: string): Promise<Theme> {
    const res = await cb2(this.db._query, {
      query: "SELECT id, theme FROM whitelabeling",
      cache: true,
      where: { "id = $::TEXT": vID },
    });
    const data = res.rows[0];
    if (data != null) {
      // post-process data, but do not set default values…
      const theme: Theme = {};
      for (const [key, value] of Object.entries(data.theme)) {
        const config = SITE_SETTINGS_CONF[key] ?? SERVER_SETTINGS_EXTRAS[key];
        if (typeof config?.to_val == "function") {
          theme[key] = config.to_val(value, data.theme);
        } else {
          if (typeof value == "string" || typeof value == "boolean") {
            theme[key] = value;
          }
        }
      }
      L(`vanity theme=${JSON.stringify(theme)}`);
      return theme;
    } else {
      L(`theme id=${vID} not found`);
      return {};
    }
  }

  private async get_vanity(vID): Promise<object> {
    if (vID != null && vID !== "") {
      L(`vanity ID = "${vID}"`);
      return await this.theme(vID);
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
    const vID = this.get_vanity_id(host);
    const config = this.data.pub;
    const vanity = await this.get_vanity(vID);
    return { ...config, ...vanity, ...{ country, dns: host } };
  }

  private async get_strategies(): Promise<object> {
    const key = "strategies";
    let strategies = CACHE.get(key);
    if (strategies == null) {
      // wait until this.passport_manager is initialized.
      // this could happen right at the start of the server
      const passport_manager = await get_passport_manager_async();
      strategies = passport_manager.get_strategies_v2();
      CACHE.set(key, strategies);
    }
    return strategies as object;
  }

  // derives the public ollama model configuration from the private one
  private get_ollama_public(): { [key: string]: CustomLLMPublic } {
    if (this.data == null) {
      throw new Error("server settings not yet initialized");
    }
    const ollama = this.data.all.ollama_configuration;
    return processCustomLLM(ollama, "Ollama");
  }

  private get_custom_openai_public(): { [key: string]: CustomLLMPublic } {
    if (this.data == null) {
      throw new Error("server settings not yet initialized");
    }
    const custom_openai = this.data.all.custom_openai_configuration;
    return processCustomLLM(custom_openai, "OpenAI (custom)");
  }

  private async get_config({ country, host }): Promise<Config> {
    while (this.data == null) {
      L.debug("waiting for server settings to be initialized");
      await delay(100);
    }

    const [configuration, registration, software, ollama, custom_openai] =
      await Promise.all([
        this.get_configuration({ host, country }),
        have_active_registration_tokens(this.db),
        getSoftwareEnvironments("webapp"),
        this.get_ollama_public(),
        this.get_custom_openai_public(),
      ]);
    const strategies = await this.get_strategies();
    return {
      configuration,
      registration,
      strategies,
      software,
      ollama,
      custom_openai,
    };
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

// for Ollama or Custom OpenAI
function processCustomLLM(
  data: any,
  displayFallback,
): { [key: string]: CustomLLMPublic } {
  if (isEmpty(data)) return {};

  const ret: { [key: string]: CustomLLMPublic } = {};
  for (const key in data) {
    const conf = data[key];
    const cocalc = conf.cocalc ?? {};
    if (cocalc.disabled) continue;
    const model = conf.model ?? key;
    ret[key] = {
      model,
      display: cocalc.display ?? `${displayFallback} ${model}`,
      icon: cocalc.icon, // fallback is the Ollama or OpenAI icon, frontend does that
      desc: cocalc.desc ?? "",
    };
  }
  return ret;
}
