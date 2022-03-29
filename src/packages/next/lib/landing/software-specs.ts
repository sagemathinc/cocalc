import { hours_ago } from "@cocalc/util/relative-time";
import { reuseInFlight } from "async-await-utils/hof";
import COMPONENTS from "dist/inventory/compute-components.json";
import INVENTORY from "dist/inventory/compute-inventory.json";
import withCustomize from "lib/with-customize";
import { basename } from "path";
import {
  ComputeComponents,
  ComputeInventory,
  LanguageName,
  SoftwareSpec,
} from "./types";
import { promises } from "fs";
const { readFile } = promises;

interface EnvData {
  inventory: ComputeInventory;
  components: ComputeComponents;
}

async function file2json(path: string): Promise<any> {
  const data = await readFile(path, "utf8");
  return JSON.parse(data);
}

// load the current version of the software specs – if there is a problem, use the locally stored files as fallback.
// both files go hand-in-hand, hence either both work or both are the fallback!
async function fetchInventory(): Promise<EnvData> {
  // for development, set the env variable to directory, where this files are
  const localSpec = process.env.COCALC_COMPUTE_ENV_SPEC;
  if (localSpec != null) {
    // read compute-inventory.json and compute-components.json from the local filesystem
    console.log(`reading inventory information from directory ${localSpec}`);
    return {
      inventory: await file2json(`${localSpec}/compute-inventory.json`),
      components: await file2json(`${localSpec}/compute-components.json`),
    };
  }

  const urlI =
    "https://storage.googleapis.com/cocalc-compute-environment/compute-inventory.json";
  const urlC =
    "https://storage.googleapis.com/cocalc-compute-environment/compute-components.json";
  try {
    const [respI, respC] = await Promise.all([fetch(urlI), fetch(urlC)]);
    if (respI.ok && respC.ok) {
      const inventory = await respI.json();
      const components = await respC.json();
      console.log(
        `successfully fetched and loaded software environment config files`
      );
      return { inventory, components };
    } else {
      console.log(
        `Error fetching inventory: ${respI.status}: ${respI.statusText}.`
      );
      throw Error("problem");
    }
  } catch (err) {
    console.log(`Error fetching inventory: ${err} -- using fallback.`);
    return {
      inventory: INVENTORY as ComputeInventory,
      components: COMPONENTS as ComputeComponents,
    };
  }
}

// cached instance
let SPEC: Readonly<SoftwareSpec>;

let SoftwareEnvSpecs: {
  inventory: ComputeInventory;
  components: ComputeComponents;
};
let SoftwareEnvSpecsTimestamp: number = 0;

const fetchSoftwareSpec = reuseInFlight(async function () {
  const { inventory, components } = await fetchInventory();
  SoftwareEnvSpecs = { inventory, components };
  SoftwareEnvSpecsTimestamp = Date.now();
});

async function getSoftwareInfo(): Promise<{
  inventory: ComputeInventory;
  components: ComputeComponents;
}> {
  // if SoftwareEnvSpecs is not set or not older than one hour, fetch it
  if (SoftwareEnvSpecs != null) {
    if (SoftwareEnvSpecsTimestamp > hours_ago(1).getTime()) {
      // fresh enough, just return it
      return SoftwareEnvSpecs;
    } else {
      // we asynchroneously fetch to refresh, but return the data immediately to the client
      fetchSoftwareSpec();
      return SoftwareEnvSpecs;
    }
  } else {
    await fetchSoftwareSpec();
    return SoftwareEnvSpecs;
  }
}

async function getSoftwareInfoLang(lang: LanguageName): Promise<{
  inventory: ComputeInventory[LanguageName];
  components: ComputeComponents[LanguageName];
}> {
  const { inventory, components } = await getSoftwareInfo();
  return { inventory: inventory[lang], components: components[lang] };
}

// during startup, we fetch getSoftwareSpec() once to fill the cache…
(async function () {
  fetchSoftwareSpec(); // not blocking
})();

async function getSoftwareSpec(): Promise<SoftwareSpec> {
  if (SPEC != null) return SPEC;
  const nextSpec: Partial<SoftwareSpec> = {};
  const { inventory } = await getSoftwareInfo();
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
    };
  }
  SPEC = nextSpec as SoftwareSpec;
  return SPEC;
}

// this is for the server side getServerSideProps function
export async function withCustomizedAndSoftwareSpec(
  context,
  lang: LanguageName | "executables"
) {
  const [customize, spec] = await Promise.all([
    withCustomize({ context }),
    getSoftwareSpec(),
  ]);

  if (lang === "executables") {
    // this is instant because specs are already in the cache
    const { inventory } = await getSoftwareInfo();
    customize.props.executablesSpec = inventory.executables;
    return customize;
  } else {
    customize.props.spec = spec[lang];
    // this is instant because specs are already in the cache
    const { inventory, components } = await getSoftwareInfoLang(lang);
    customize.props.inventory = inventory;
    customize.props.components = components;
  }
  return customize;
}
