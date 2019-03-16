
/*
 * derive configuratino and capabilities of the given project.
 * this is used in the UI to only show those elements, which should work.
 */

import * as which from "which";
import { access as fs_access, constants as fs_constaints } from "fs";
import { APPS } from "../smc-webapp/frame-editors/x11-editor/apps";
import { ConfigurationAspect } from "../smc-webapp/project_configuration";
import {
  Configuration,
  Capabilities,
  MainCapabilities,
  LIBRARY_INDEX_FILE
} from "../smc-webapp/project_configuration";

async function have(name: string): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    which(name, function(error, path) {
      if (error || path == null) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
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

async function sage(): Promise<boolean> {
  // TODO probably also check if smc_sagews is working?
  // without sage, sagews files are disabled
  return await have("sage");
}

async function jupyter(): Promise<Capabilities | boolean> {
  const jupyter = (await have("jupyter"))
    ? {
        lab: await have("jupyter-lab"),
        notebook: await have("jupyter-notebook"),
        kernelspec: await have("jupyter-kernelspec")
      }
    : false;
  return jupyter;
}

async function latex(): Promise<boolean> {
  const pdf = have("pdflatex");
  const latexmk = have("latexmk");
  return (await pdf) && (await latexmk);
}

async function spellcheck(): Promise<boolean> {
  return await have("aspell");
}

// this is for rnw RMarkdown files.
// This just tests R, which as knitr by default?
async function rmd(): Promise<boolean> {
  return await have("R");
}

// just check if we can read that json file
async function library(): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    fs_access(LIBRARY_INDEX_FILE, fs_constaints.R_OK, err => {
      resolve(err ? false : true);
    });
  });
}

async function capabilities(): Promise<MainCapabilities> {
  const caps: MainCapabilities = {
    jupyter: await jupyter(),
    latex: await latex(),
    sage: await sage(),
    x11: await x11(),
    rmd: await rmd(),
    spellcheck: await spellcheck(),
    library: await library()
  };
  return caps;
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
        return {
          timestamp: new Date(),
          capabilities: await x11_apps()
        };
    }
  })();
  new_conf.timing_s = (new Date().getTime() - t0) / 1000;
  conf[aspect] = await new_conf;
  return new_conf;
}

// run ts-node configuration.ts  for testing
// (async () => { console.log(await x11_apps()); })()
