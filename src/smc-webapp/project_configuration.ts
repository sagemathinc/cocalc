/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * this manages project configuration specific aspects.
 * It is the corresponding counterpart of smc-project/configuration.ts
 * The various "capabilities" data-structures are used to show/hide UI elements or suppress
 * calling certain operations which are not possible (e.g. spellcheck requires aspell)
 */

import { Map as iMap } from "immutable";
import { KNITR_EXTS } from "./frame-editors/latex-editor/constants";
import { TypedMap } from "./app-framework";
import { WebappClient } from "./webapp-client";

export const LIBRARY_INDEX_FILE = "/ext/library/cocalc-examples/index.json";

export type ConfigurationAspect = "main" | "x11";

export interface MainConfiguration {
  capabilities: MainCapabilities;
  timestamp: string;
  // disabled extensions, for opening/creating files
  disabled_ext: string[];
}

export type Capabilities = { [key: string]: boolean };

export interface X11Configuration {
  timestamp: string;
  capabilities: Capabilities;
}

export type Configuration = MainConfiguration | X11Configuration;

export type ProjectConfiguration = iMap<ConfigurationAspect, Configuration>;

export interface MainCapabilities {
  jupyter: boolean | Capabilities;
  formatting: Capabilities; // yapf & co.
  hashsums: Capabilities;
  latex: boolean;
  sage: boolean;
  sage_version?: number[];
  x11: boolean;
  rmd: boolean;
  spellcheck: boolean;
  library: boolean;
  sshd: boolean;
}

export interface Available {
  jupyter_lab: boolean;
  jupyter_notebook: boolean;
  jupyter: boolean;
  x11: boolean;
  latex: boolean;
  sage: boolean;
  rmd: boolean; // TODO besides R, what's necessary?
  spellcheck: boolean;
  library: boolean;
  formatting: Capabilities | boolean;
}

export type AvailableFeatures = TypedMap<Available>;

const NO_AVAIL: Readonly<Available> = Object.freeze({
  jupyter_lab: false,
  jupyter_notebook: false,
  jupyter: false,
  sage: false,
  latex: false,
  rmd: false,
  x11: false,
  spellcheck: false,
  library: false,
  formatting: false,
});

export const ALL_AVAIL: Readonly<Available> = Object.freeze({
  jupyter_lab: true,
  jupyter_notebook: true,
  jupyter: true,
  sage: true,
  latex: true,
  rmd: true,
  x11: true,
  spellcheck: true,
  library: true,
  formatting: true,
});

// detecting certain datastructures, only used for TS typing
function isMainCapabilities(
  caps: MainCapabilities | Capabilities
): caps is MainCapabilities {
  const mcaps = <MainCapabilities>caps;
  return (
    mcaps.jupyter != null &&
    ["object", "boolean"].includes(typeof mcaps.jupyter) &&
    typeof mcaps.spellcheck === "boolean" &&
    typeof mcaps.library === "boolean" &&
    mcaps.hashsums != null
  );
}

export function isMainConfiguration(
  config: MainConfiguration | X11Configuration
): config is MainConfiguration {
  const mconf = <MainConfiguration>config;
  // don't test for disabled_ext, because that's added later
  return (
    isMainCapabilities(mconf.capabilities) &&
    mconf.timestamp != null &&
    typeof mconf.timestamp == "string"
  );
}

// if prettier exists, this adds all syntaxes to format via prettier
function formatting_prettier(formatting: Capabilities): Capabilities {
  if (formatting.prettier) {
    formatting.postcss = true;
    formatting.babel = true;
    formatting.typescript = true;
    formatting.json = true;
    formatting.yaml = true;
    formatting.markdown = true;
  }
  // for backwards compatibility
  if (formatting.yapf) {
    formatting.python = true;
  }
  if (formatting.biber) {
    formatting["bib-biber"] = true;
  }
  if (formatting.tidy) {
    formatting["xml-tidy"] = true;
    formatting["html-tidy"] = true;
  }
  if (formatting.formatR) {
    formatting.r = true;
  }
  if (formatting.latexindent) {
    formatting.latex = true;
  }
  return formatting;
}

// derive available types of files from the configuration map
export function is_available(configuration?: ProjectConfiguration): Available {
  if (configuration == null) {
    // If the configuration is not yet available, we default to the *most likely*
    // configuration, not the least likely configuration.
    // See https://github.com/sagemathinc/cocalc/issues/4293
    // We could alternatively make it so nothing that uses capabilites
    // is available until configuration is loaded, but I don't like that
    // since right now things like clicking a button to create a new file
    // *do* work fine even if the project isn't yet running (they start
    // the project, wait properly until it is running, then create the file).
    return ALL_AVAIL;
  }

  const main: Configuration | undefined = configuration.get("main");
  if (main == null) return ALL_AVAIL; // see note above
  const capabilities = main.capabilities as MainCapabilities;
  if (capabilities == null) return ALL_AVAIL; // see note above.
  const jupyter: Capabilities | boolean = capabilities.jupyter;

  const formatting = formatting_prettier(capabilities.formatting);

  // uncomment for testing
  // formatting["yapf"] = formatting["tidy"] = false;

  if (typeof jupyter !== "boolean") {
    const kernelspec: boolean = !!jupyter.kernelspec;
    return {
      jupyter_lab: kernelspec && !!jupyter.lab,
      jupyter_notebook: kernelspec && !!jupyter.notebook,
      jupyter: kernelspec,
      sage: !!capabilities.sage,
      latex: !!capabilities.latex,
      rmd: !!capabilities.rmd,
      x11: !!capabilities.x11,
      spellcheck: !!capabilities.spellcheck,
      library: !!capabilities.library,
      formatting,
    };
  } else {
    return NO_AVAIL;
  }
}

// main function, this calls the project "configuration" endpoint.
// it also manages updating the configuration datastructure, which is used in the project actions
export async function get_configuration(
  webapp_client: WebappClient,
  project_id: string,
  aspect: ConfigurationAspect = "main",
  prev: ProjectConfiguration,
  no_cache = false
): Promise<ProjectConfiguration | undefined> {
  // the actual API call, returning an object
  const config: Configuration = await webapp_client.project_client.configuration(
    project_id,
    aspect,
    no_cache
  );
  if (config == null) return prev;
  // console.log("project_actions::init_configuration", aspect, config);

  if (aspect == ("main" as ConfigurationAspect)) {
    if (!isMainConfiguration(config)) return;
    const caps = config.capabilities;
    // TEST x11/latex/sage disabilities
    // caps.x11 = false;
    // caps.latex = false;
    // caps.sage = false;
    // caps.library = false;

    // don't show jupyter buttons if there is no jupyter
    const jupyter = caps.jupyter;
    if (typeof jupyter !== "boolean") {
      // TEST no jupyter lab or notebook
      // jupyter.lab = false;
      // TEST no kernelspec → we can't read any kernels → entirely disable jupyter
      // jupyter.kernelspec = false;
      if (!jupyter.kernelspec) caps.jupyter = false;
    }

    // disable/hide certain file extensions if certain capabilities are missing
    // (ideally, the ssociated editors shouldn't initialize at all)
    const disabled_ext = (config.disabled_ext = [] as string[]);
    if (!caps.jupyter) disabled_ext.push("ipynb");
    if (!caps.rmd) disabled_ext.push("rmd");
    if (!caps.latex) disabled_ext.push(...KNITR_EXTS.concat(["tex"]));
    if (!caps.sage) disabled_ext.push("sagews", "sage");
    if (!caps.x11) disabled_ext.push("x11");
  }

  if (prev != null) {
    const next = prev.set(aspect, config);
    return next;
  } else {
    return iMap<ConfigurationAspect, Configuration>([[aspect, config]]);
  }
}
