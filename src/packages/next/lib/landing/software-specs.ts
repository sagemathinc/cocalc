/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { reuseInFlight } from "async-await-utils/hof";
import { keys, map, sortBy, zipObject } from "lodash";
import { promises } from "node:fs";
import { basename } from "node:path";

import { hours_ago } from "@cocalc/util/relative-time";
import { NOT_FOUND } from "lib/config";
import withCustomize from "lib/with-customize";
import { GetServerSidePropsContext } from "next";
import { SOFTWARE_ENV_NAMES, SoftwareEnvNames } from "./consts";
import { SOFTWARE_FALLBACK, SOFTWARE_URLS } from "./software-data";
import {
  ComputeComponents,
  ComputeInventory,
  EnvData,
  LanguageName,
  SoftwareSpec,
} from "./types";
import { NOTFOUND } from "node:dns";

const { readFile } = promises;

async function makeObject(keys, fn) {
  return zipObject(keys, await Promise.all(map(keys, fn)));
}

type SoftwareEnvironments = { [key in SoftwareEnvNames]: EnvData };

let SoftwareEnvSpecs: SoftwareEnvironments | null = null;
let SoftwareEnvDownloadedTimestamp: number = 0;

async function file2json(path: string): Promise<any> {
  const data = await readFile(path, "utf8");
  return JSON.parse(data);
}

async function downloadInventoryJson(name: SoftwareEnvNames): Promise<EnvData> {
  try {
    const raw = await fetch(SOFTWARE_URLS[name]);
    if (!raw.ok) {
      console.log(`Problem downloading: ${raw.status}: ${raw.statusText}`);
    } else {
      const data = await raw.json();
      console.log(`Downloaded software inventory ${name} successfully`);
      return data;
    }
  } catch (err) {
    console.log(`Problem downloading: ${err}`);
  }
  return SOFTWARE_FALLBACK[name] as EnvData;
}

// load the current version of the software specs – if there is a problem, use the locally stored files as fallback.
// both files go hand-in-hand, hence either both work or both are the fallback!
async function fetchInventory(): Promise<SoftwareEnvironments> {
  // for development, set the env variable to directory, where this files are
  const localSpec = process.env.COCALC_SOFTWARE_ENVIRONMENTS;
  if (localSpec != null) {
    // read compute-inventory.json and compute-components.json from the local filesystem
    console.log(`Reading inventory information from directory ${localSpec}`);
    return await makeObject(
      SOFTWARE_ENV_NAMES,
      async (name) =>
        await file2json(`${localSpec}/software-inventory-${name}.json`)
    );
  }
  try {
    // download the files for the newest information from the server
    const ret = await makeObject(
      SOFTWARE_ENV_NAMES,
      async (name) => await downloadInventoryJson(name)
    );
    return ret;
  } catch (err) {
    console.error(`Problem fetching software inventory: ${err}`);
    return SOFTWARE_FALLBACK;
  }
}

const fetchSoftwareSpec = reuseInFlight(async function () {
  SoftwareEnvSpecs = await fetchInventory();
  SoftwareEnvDownloadedTimestamp = Date.now();
  return SoftwareEnvSpecs;
});

/**
 * get a cached copy of the software specs
 */
async function getSoftwareInfo(name: SoftwareEnvNames): Promise<EnvData> {
  // if SoftwareEnvSpecs is not set or not older than one hour, fetch it
  if (SoftwareEnvSpecs != null) {
    if (SoftwareEnvDownloadedTimestamp > hours_ago(1).getTime()) {
      // fresh enough, just return it
      return SoftwareEnvSpecs[name];
    } else {
      // we asynchroneously fetch to refresh, but return the data immediately to the client
      fetchSoftwareSpec();
      return SoftwareEnvSpecs[name];
    }
  } else {
    const specs = await fetchSoftwareSpec();
    return specs[name];
  }
}

async function getSoftwareInfoLang(
  name: SoftwareEnvNames,
  lang: LanguageName
): Promise<{
  inventory: ComputeInventory[LanguageName];
  components: ComputeComponents[LanguageName];
  timestamp: string;
}> {
  const { inventory, data, timestamp } = await getSoftwareInfo(name);
  return { inventory: inventory[lang], components: data[lang], timestamp };
}

// during startup, we fetch getSoftwareSpec() once to warm up the cache…
(async function () {
  fetchSoftwareSpec(); // not blocking
})();

// cached processed software specs
let SPEC: Record<SoftwareEnvNames, Readonly<SoftwareSpec> | null> = {} as any;

async function getSoftwareSpec(name: SoftwareEnvNames): Promise<SoftwareSpec> {
  const cached = SPEC[name];
  if (cached != null) return cached;
  const nextSpec: Partial<SoftwareSpec> = {};
  const { inventory } = await getSoftwareInfo(name);
  for (const cmd in inventory.language_exes) {
    const info = inventory.language_exes[cmd];
    if (nextSpec[info.lang] == null) {
      nextSpec[info.lang] = {};
    }
    // the basename of the cmd path
    const base = cmd.indexOf(" ") > 0 ? cmd : basename(cmd);
    nextSpec[info.lang][base] = {
      cmd,
      name: info.name,
      doc: info.doc,
      url: info.url,
      path: info.path,
    };
  }
  SPEC[name] = nextSpec as SoftwareSpec;
  return nextSpec as SoftwareSpec;
}

/**
 * This determines the order of columns when there is more than on executable for a language.
 */
function getLanguageExecutables({ lang, inventory }): string[] {
  if (inventory == null) return [];
  return sortBy(keys(inventory[lang]), (x: string) => {
    if (lang === "python") {
      if (x.endsWith("python3")) return ["0", x];
      if (x.indexOf("sage") >= 0) return ["2", x];
      if (x.endsWith("python2")) return ["3", x];
      return ["1", x]; // anaconda envs and others
    } else {
      return x.toLowerCase();
    }
  });
}

async function getSoftwareEnvData({ context, name, lang }) {
  const [customize, spec] = await Promise.all([
    withCustomize({ context }),
    getSoftwareSpec(name),
  ]);

  customize.props.name = name;

  if (lang === "executables") {
    // this is instant because specs are already in the cache
    const softwareInfo = await getSoftwareInfo(name);
    const { inventory, timestamp } = softwareInfo;
    customize.props.executablesSpec = inventory.executables;
    customize.props.timestamp = timestamp;
    return customize;
  } else {
    customize.props.spec = spec[lang];
    // this is instant because specs are already in the cache
    const { inventory, components, timestamp } = await getSoftwareInfoLang(
      name,
      lang
    );
    customize.props.inventory = inventory;
    customize.props.components = components;
    customize.props.timestamp = timestamp;
  }

  // at this point, lang != "executables"
  // we gather the list of interpreters (executables) for the given language
  const { inventory } = await getSoftwareInfo(name);
  customize.props.execInfo = {};
  for (const cmd of getLanguageExecutables({ inventory, lang })) {
    const path = inventory.language_exes[cmd]?.path ?? cmd;
    customize.props.execInfo[path] = inventory.executables?.[path] ?? null;
  }

  return customize;
}

async function getSoftwarePackageInfo({ lang, context, pkgName }) {

const data : {[name : SoftwareEnvNames]: any} = {}

for (const name of SOFTWARE_ENV_NAMES) {
  const env = await getSoftwareEnvData({ context, name, lang });
  const info = await getSoftwareInfo(name);

  if (lang === "executables") {
    return NOT_FOUND;
  } else {
  const inventory: ComputeInventory[LanguageName] = info.inventory
  const components: ComputeComponents[LanguageName] =
    const pkg = inventory[lang]?.[name];
    if (pkg == null) return NOT_FOUND;
    const component = components[lang]?.[name];
    if (component == null) return NOT_FOUND;
    customize.props.component = component;
    customize.props.pkg = pkg;
    return customize;
  }
}
}

// this is for the server side getServerSideProps function
export async function withCustomizedAndSoftwareSpec(
  context: GetServerSidePropsContext,
  lang: LanguageName | "executables"
) {
  const name = context.params?.name;

  if (typeof name !== "string") return NOT_FOUND;

  // check if this should list all the available packages
  if (SOFTWARE_ENV_NAMES.includes(name as any)) {
    return await getSoftwareEnvData({ context, name, lang });
  }

  // or just the info about a specific package
  return await getSoftwarePackageInfo({ lang, context, pkgName: name });
}
