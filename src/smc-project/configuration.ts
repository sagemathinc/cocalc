/*
 * derive configuratino and capabilities of the given project.
 * this is used in the UI to only show those elements, which should work.
 */

import * as which from "which";
import { callback } from "awaiting";
import { APPS } from "../smc-webapp/frame-editors/x11-editor/apps";

import { ConfigurationAspect } from "smc-webapp/project/websocket/api";
export type Configuration = { [key: string]: object };

async function have(name: string): Promise<boolean> {
  const path = await callback(which, name, { nothrow: true });
  return !!path;
}

// we cache this as long as the project runs
const conf: { [key in ConfigurationAspect]?: Configuration } = {};

async function x11_apps(): Promise<object> {
  const status: Promise<boolean>[] = [];
  const KEYS = Object.keys(APPS);
  for (let key of KEYS) {
    const app = APPS[key];
    status.push(have(app.command != null ? app.command : key));
  }
  const results = Promise.all(status);
  return status.map((s, idx) => [s, results[idx]]);
}

// return supported apps if X11 should work, or falsy.
async function x11(): Promise<boolean> {
  return await have("xpra");
}

async function sagews(): Promise<boolean> {
  // TODO probably also check if smc_sagews is working
  return await have("sage");
}

async function latex(): Promise<boolean> {
  const pdf = have("pdflatex");
  const latexmk = have("latexmk");
  return (await pdf) && (await latexmk);
}

async function capabilities(): Promise<object> {
  return {
    latex: await latex(),
    sagews: await sagews(),
    x11: await x11()
  };
}

export async function get_configuration(
  aspect: ConfigurationAspect
): Promise<object> {
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
