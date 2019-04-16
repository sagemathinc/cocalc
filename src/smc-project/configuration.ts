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
import { parser2tool, Tool as FormatTool } from "../smc-util/code-formatter";

async function have(name: string): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    which(name, function(error, path) {
      resolve(error == null && path != null);
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
  if (await have("jupyter")) {
    return {
      lab: await have("jupyter-lab"),
      notebook: await have("jupyter-notebook"),
      kernelspec: await have("jupyter-kernelspec")
    };
  } else {
    return false;
  }
}

async function latex(hashsums: Capabilities): Promise<boolean> {
  const prereq: string[] = ["pdflatex", "latexmk", "synctex"];
  const have_prereq = (await Promise.all(prereq.map(have))).every(p => p);
  return hashsums.sha1sum && have_prereq;
}

// plain text editors (md, tex, ...) use aspell → disable calling aspell if not available.
async function spellcheck(): Promise<boolean> {
  return await have("aspell");
}

// without sshd we cannot copy to this project. that's vital for courses.
async function sshd(): Promise<boolean> {
  return await have("/usr/sbin/sshd");
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

// formatting code, e.g. python, javascript, etc.
// we check this here, because the frontend should offer these choices if available.
// in some cases like python, there could be multiple ways (yapf, yapf3, black, autopep8, ...)
async function formatting(): Promise<Capabilities> {
  const status: Promise<boolean>[] = [];
  const tools = new Array(
    ...new Set(Object.keys(parser2tool).map(k => parser2tool[k]))
  );
  tools.push("yapf3", "black", "autopep8");
  for (let tool of tools) {
    if (tool === ("formatR" as FormatTool)) {
      // TODO special case. must check for package "formatR" in "R" -- for now just test for R
      status.push(have("R"));
    } else {
      status.push(have(tool));
    }
  }
  const results = await Promise.all(status);
  const ret: Capabilities = {};
  tools.map((tool, idx) => (ret[tool] = results[idx]));
  // just for testing
  // ret['yapf'] = false;
  // prettier always available, because it is a js library dependency
  ret["prettier"] = true;
  return ret;
}

async function get_hashsums(): Promise<Capabilities> {
  return {
    sha1sum: await have("sha1sum"),
    sha256sum: await have("sha256sum"),
    md5sum: await have("md5sum")
  };
}

async function capabilities(): Promise<MainCapabilities> {
  const hashsums = await get_hashsums();
  const caps: MainCapabilities = {
    jupyter: await jupyter(),
    formatting: await formatting(),
    hashsums,
    latex: await latex(hashsums),
    sage: await sage(),
    x11: await x11(),
    rmd: await rmd(),
    spellcheck: await spellcheck(),
    library: await library(),
    sshd: await sshd()
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
