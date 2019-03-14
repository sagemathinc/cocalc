/*
 * derive configuratino and capabilities of the given project.
 * this is used in the UI to only show those elements, which should work.
 */

import * as which from "which";
import { callback } from "awaiting";
import { APPS } from "../smc-webapp/frame-editors/x11-editor/apps";

import { ConfigurationAspect } from "../smc-webapp/project/websocket/api";
export type Configuration = { [key: string]: object };
export type Capabilities = { [key: string]: boolean | Capabilities };

async function have(name: string): Promise<boolean> {
  try {
    return !!(await callback(which, name));
  } catch {
    return false;
  }
}

// we cache this as long as the project runs
const conf: { [key in ConfigurationAspect]?: Configuration } = {};

async function x11_apps(): Promise<Capabilities> {
  const status: Promise<boolean>[] = [];
  const KEYS = Object.keys(APPS);
  for (let key of KEYS) {
    const app = APPS[key];
    status.push(have(app.command != null ? app.command : key));
  }
  const results = await Promise.all(status);
  const ret: { [key: string]: boolean } = {};
  KEYS.map((name, idx) => (ret[name] = results[idx]));
  return ret;
}

// return supported apps if X11 should work, or falsy.
async function x11(): Promise<boolean> {
  return await have("xpra");
}

async function sagews(): Promise<boolean> {
  // TODO probably also check if smc_sagews is working
  return await have("sage");
}

async function jupyter(): Promise<Capabilities> {
  const jupyter = (await have("jupyter"))
    ? {
        lab: await have("jupyter-lab"),
        notebook: await have("jupyter-notebook"),
        kernelspec: await have("jupyter-kernelspec")
      }
    : false;
  return { jupyter };
}

async function latex(): Promise<boolean> {
  const pdf = have("pdflatex");
  const latexmk = have("latexmk");
  return (await pdf) && (await latexmk);
}

async function capabilities(): Promise<Capabilities> {
  const j_prom = jupyter();
  const caps: Capabilities = {
    latex: await latex(),
    sagews: await sagews(),
    x11: await x11()
  };
  return Object.assign(caps, await j_prom);
}

export async function get_configuration(
  aspect: ConfigurationAspect
): Promise<Configuration> {
  const cached = conf[aspect];
  if (cached != null) return cached;
  const t0 = new Date().getTime();
  const new_conf: any = (async function() {
    switch (aspect) {
      case "main":
        return {
          timestamp: new Date(),
          capabilities: await capabilities()
        };
      case "x11":
        return await x11_apps();
    }
  })();
  new_conf.timing_s = (new Date().getTime() - t0) / 1000;
  conf[aspect] = new_conf;
  return new_conf;
}

// run ts-node configuration.ts  for testing
// (async () => { console.log(await x11_apps()); })()
