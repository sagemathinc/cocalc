/*
 * derive configuratino and capabilities of the given project.
 * this is used in the UI to only show those elements, which should work.
 */

import * as which from "which";
import { callback } from "awaiting";
import { APPS } from "../smc-webapp/frame-editors/x11-editor/apps";

async function have(name: string): Promise<boolean> {
  const path = await callback(which, name, { nothrow: true });
  return !!path;
}

// we cache this as long as the project runs
let conf: object | null = null;

async function x11_apps(): Promise<object> {
  let status = {};
  for (let key of Object.keys(APPS)) {
    const app = APPS[key];
    status[key] = await have(app.command != null ? app.command : key);
  }
  return status;
}

// return supported apps if X11 should work, or falsy.
async function x11(): Promise<object | null> {
  const xpra = await have("xpra");
  return xpra ? await x11_apps() : {};
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

export async function get_configuration(): Promise<object> {
  if (conf != null) return conf;
  const t0 = new Date().getTime();
  const new_conf: any = {
    timestamp: new Date(),
    capabilities: await capabilities()
  };
  new_conf.timing_s = (new Date().getTime() - t0) / 1000;
  conf = new_conf;
  return new_conf;
}
