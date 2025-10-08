/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * This derives the configuration and capabilities of the current project.
 * It is used in the UI to only show/run those elements, which should work.
 * The corresponding file in the webapp is @cocalc/frontend/project_configuration.ts
 */

import { APPS } from "@cocalc/comm/x11-apps";
import {
  Capabilities,
  Configuration,
  ConfigurationAspect,
  LIBRARY_INDEX_FILE,
  MainCapabilities,
} from "@cocalc/comm/project-configuration";
import { syntax2tool, Tool as FormatTool } from "@cocalc/util/code-formatter";
import { copy } from "@cocalc/util/misc";
import { exec as child_process_exec } from "child_process";
import { access as fs_access, constants as fs_constaints } from "fs";
import { realpath } from "fs/promises";
import { promisify } from "util";
import which from "which";
const exec = promisify(child_process_exec);
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { getLogger } from "@cocalc/backend/logger";
const logger = getLogger("configuration");

// we prefix the environment PATH by default bin paths pointing into it in order to pick up locally installed binaries.
// they can't be set as defaults for projects since this could break it from starting up
function construct_path(): string {
  const env = process.env;
  // we can safely assume that PATH is defined
  const entries = env.PATH!.split(":");
  const home = env.HOME ?? "/home/user";
  entries.unshift(`${home}/.local/bin`);
  entries.unshift(`${home}/bin`);
  return entries.join(":");
}

const PATH = construct_path();

// test if the given utility "name" exists (executable in the PATH)
async function have(name: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    which(name, { path: PATH }, function (error, path) {
      resolve(error == null && path != null);
    });
  });
}

// we cache this as long as the project runs
const conf: { [key in ConfigurationAspect]?: Configuration } = {};

// check for all X11 apps.
// UI will only show buttons for existing executables.
async function x11_apps(): Promise<Capabilities> {
  const status: Promise<boolean>[] = [];
  const KEYS = Object.keys(APPS);
  for (const key of KEYS) {
    const app = APPS[key];
    status.push(have(app.command != null ? app.command : key));
  }
  const results = await Promise.all(status);
  const ret: { [key: string]: boolean } = {};
  KEYS.map((name, idx) => (ret[name] = results[idx]));
  return ret;
}

// determines if X11 support exists at all
async function get_x11(): Promise<boolean> {
  return await have("xpra");
}

// Quarto document formatter (on top of pandoc)
async function get_quarto(): Promise<boolean> {
  return await have("quarto");
}

// do we have "sage"? which version?
async function get_sage_info(): Promise<{
  exists: boolean;
  version: number[] | undefined;
}> {
  const exists = await have("sage");
  let version: number[] | undefined = undefined;
  if (exists) {
    // We need the version of sage (--version runs quickly)
    try {
      const env = copy(process.env);
      env.PATH = PATH;
      const info = (await exec("sage --version", { env })).stdout.trim();
      const m = info.match(/version ([\d+.]+[\d+])/);
      if (m != null) {
        const v = m[1];
        if (v != null && v.length > 1) {
          version = v.split(".").map((x) => parseInt(x));
          // console.log(`Sage version info: ${info} ->  ${version}`, env);
        }
      }
    } catch (err) {
      // TODO: do something better than silently ignoring errors.  This console.log
      // isn't going to be seen by the user.
      console.log("Problem fetching sage version info -- ignoring", err);
    }
  }
  return { exists, version };
}

// this checks the level of jupyter support. none (false), or classical, lab, ...
async function get_jupyter(): Promise<Capabilities | boolean> {
  if (await have("jupyter")) {
    return {
      lab: await have("jupyter-lab"),
      notebook: await have("jupyter-notebook"),
      kernelspec: await have("jupyter-kernelspec"),
    };
  } else {
    return false;
  }
}

// to support latex, we need a couple of executables available
// TODO dumb down the UI to also work with less tools (e.g. without synctex)
async function get_latex(hashsums: Capabilities): Promise<boolean> {
  const prereq: string[] = ["pdflatex", "latexmk", "synctex"];
  const have_prereq = (await Promise.all(prereq.map(have))).every((p) => p);
  // TODO webapp only uses sha1sum. use a fallback if not available.
  return hashsums.sha1sum && have_prereq;
}

// plain text editors (md, tex, ...) use aspell → disable calling aspell if not available.
async function get_spellcheck(): Promise<boolean> {
  return await have("aspell");
}

// without sshd we cannot copy to this project. that's vital for courses.
async function get_sshd(): Promise<boolean> {
  return await have("/usr/sbin/sshd");
}

// we check if we can use headless chrome to do html to pdf conversion,
// which uses either google-chrome or chromium-browser.  Note that there
// is no good headless pdf support using firefox.
// (TODO: I don't think this is used in our code in practice, and instead not
// having one of these at runtime would just result in a error message
// to the user mentioning it is missing.)
async function get_html2pdf(): Promise<boolean> {
  return (await have("chromium-browser")) || (await have("google-chrome"));
}

// do we have pandoc, e.g. used for docx2md
async function get_pandoc(): Promise<boolean> {
  return await have("pandoc");
}

// this is for rnw RMarkdown files.
// This just tests R, which provides knitr out of the box?
async function get_rmd(): Promise<boolean> {
  return await have("R");
}

// jq is used to e.g. pre-process ipynb files
async function get_jq(): Promise<boolean> {
  return await have("jq");
}

// code-server is VS Code's Sever version, which we use to provide a web-based editor.
async function get_vscode(): Promise<boolean> {
  return await have("code-server");
}

// julia executable, for the programming language, and we also assume that "Pluto" package is installed
async function get_julia(): Promise<boolean> {
  return await have("julia");
}

// rserver is the name of the executable to start the R IDE Server.
// In a default Linux installation, it is not in the PATH – therefore add a symlink pointing to it.
// At the time of writing this, it was here: /usr/lib/rstudio-server/bin/rserver
async function get_rserver(): Promise<boolean> {
  return await have("rserver");
}

// check if we can read that json file.
// if it exists, show the corresponding button in "Files".
async function get_library(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    fs_access(LIBRARY_INDEX_FILE, fs_constaints.R_OK, (err) => {
      resolve(err ? false : true);
    });
  });
}

// formatting code, e.g. python, javascript, etc.
// we check this here, because the frontend should offer these choices if available.
// in some cases like python, there could be multiple ways (yapf, yapf3, black, autopep8, ...)
async function get_formatting(): Promise<Capabilities> {
  const status: Promise<any>[] = [];
  const tools = new Array(
    ...new Set(Object.keys(syntax2tool).map((k) => syntax2tool[k])),
  );
  tools.push("yapf3", "black", "autopep8");
  const tidy = have("tidy");

  const ret: Capabilities = {};
  for (const tool of tools) {
    if (tool === ("formatR" as FormatTool)) {
      // TODO special case. must check for package "formatR" in "R" -- for now just test for R
      status.push((async () => (ret[tool] = await have("R")))());
    } else if (tool == ("bib-biber" as FormatTool)) {
      // another special case
      status.push((async () => (ret[tool] = await have("biber")))());
    } else if (tool === ("xml-tidy" as FormatTool)) {
      // tidy, already covered
    } else {
      status.push((async () => (ret[tool] = await have(tool)))());
    }
  }

  // this populates all "await have" in ret[...]
  await Promise.all(status);

  ret["tidy"] = await tidy;
  // just for testing
  // ret['yapf'] = false;
  // prettier always available, because it is a js library dependency
  ret["prettier"] = true;
  return ret;
}

// this could be used by the webapp to fall back to other hashsums
async function get_hashsums(): Promise<Capabilities> {
  return {
    sha1sum: await have("sha1sum"),
    sha256sum: await have("sha256sum"),
    md5sum: await have("md5sum"),
  };
}

async function get_homeDirectory(): Promise<string | null> {
  // realpath is necessary, because in some circumstances the home dir is a symlink
  const home = process.env.HOME;
  if (home == null) {
    return null;
  } else {
    return await realpath(home);
  }
}

// assemble capabilities object
// no matter what, never run this more than once very this many MS.
// I have at least one project in production that gets DOS'd due to
// calls to capabilities, even with the reuseInFlight stuff.
const SHORT_CAPABILITIES_CACHE_MS = 15000;
let shortCapabilitiesCache = {
  time: 0,
  caps: null as null | MainCapabilities,
  error: null as any,
};

const capabilities = reuseInFlight(async (): Promise<MainCapabilities> => {
  const time = Date.now();
  if (time - shortCapabilitiesCache.time <= SHORT_CAPABILITIES_CACHE_MS) {
    if (shortCapabilitiesCache.error != null) {
      logger.debug("capabilities: using cache for error");
      throw shortCapabilitiesCache.error;
    }
    if (shortCapabilitiesCache.caps != null) {
      logger.debug("capabilities: using cache for caps");
      return shortCapabilitiesCache.caps as MainCapabilities;
    }
    logger.debug("capabilities: BUG -- want to use cache but no data");
  }
  logger.debug("capabilities: running");
  try {
    const sage_info_future = get_sage_info();
    const hashsums = await get_hashsums();
    const [
      formatting,
      latex,
      jupyter,
      spellcheck,
      html2pdf,
      pandoc,
      sshd,
      library,
      x11,
      rmd,
      qmd,
      vscode,
      julia,
      homeDirectory,
      rserver,
    ] = await Promise.all([
      get_formatting(),
      get_latex(hashsums),
      get_jupyter(),
      get_spellcheck(),
      get_html2pdf(),
      get_pandoc(),
      get_sshd(),
      get_library(),
      get_x11(),
      get_rmd(),
      get_quarto(),
      get_vscode(),
      get_julia(),
      get_homeDirectory(),
      get_rserver(),
    ]);
    const caps: MainCapabilities = {
      jupyter,
      rserver,
      formatting,
      hashsums,
      latex,
      sage: false,
      sage_version: undefined,
      x11,
      rmd,
      qmd,
      jq: await get_jq(), // don't know why, but it doesn't compile when inside the Promise.all
      spellcheck,
      library,
      sshd,
      html2pdf,
      pandoc,
      vscode,
      julia,
      homeDirectory,
    };
    const sage = await sage_info_future;
    caps.sage = sage.exists;
    if (caps.sage) {
      caps.sage_version = sage.version;
    }
    logger.debug("capabilities: saving caps");
    shortCapabilitiesCache.time = time;
    shortCapabilitiesCache.error = null;
    shortCapabilitiesCache.caps = caps;
    return caps as MainCapabilities;
  } catch (err) {
    logger.debug("capabilities: saving error", err);
    shortCapabilitiesCache.time = time;
    shortCapabilitiesCache.error = err;
    shortCapabilitiesCache.caps = null;
    throw err;
  }
});

// this is the entry point for the API call
// "main": everything that's needed throughout the project
// "x11": additional checks which are queried when an X11 editor opens up
// TODO similarly, query available "shells" to use for the corresponding code editor button

// This is expensive, so put in a reuseInFlight to make it cheap in case a frontend
// annoyingly calls this dozens of times at once -- https://github.com/sagemathinc/cocalc/issues/7806
export const get_configuration = reuseInFlight(
  async (
    aspect: ConfigurationAspect,
    no_cache = false,
  ): Promise<Configuration> => {
    const cached = conf[aspect];
    if (cached != null && !no_cache) return cached;
    const t0 = new Date().getTime();
    const new_conf: any = (async function () {
      switch (aspect) {
        case "main":
          return {
            timestamp: new Date(),
            capabilities: await capabilities(),
          };
        case "x11":
          return {
            timestamp: new Date(),
            capabilities: await x11_apps(),
          };
      }
    })();
    new_conf.timing_s = (new Date().getTime() - t0) / 1000;
    conf[aspect] = await new_conf;
    return new_conf;
  },
);

// testing: uncomment, and run $ ts-node configuration.ts
// (async () => {
// console.log(await x11_apps());
// console.log(await capabilities());
// })();
