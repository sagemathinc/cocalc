// manages project configuration aspects
import { Map as iMap } from "immutable";
import { ConfigurationAspect } from "./project/websocket/api";
import { KNITR_EXTS } from "./frame-editors/latex-editor/constants";

export const LIBRARY_INDEX_FILE = "/ext/library/cocalc-examples/index.json";

export type Capabilities = {
  [key: string]: boolean | Capabilities;
};
// ideally, this maps to Capabilities, but there are exceptions
export type Configuration = { [key: string]: object };
export type ProjectConfiguration = iMap<ConfigurationAspect, Configuration>;

export interface MainCapabilities {
  jupyter: boolean | Capabilities;
  latex: boolean;
  sage: boolean;
  x11: boolean;
  rmd: boolean;
  spellcheck: boolean;
  library: boolean;
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
}

const NO_AVAIL: Available = {
  jupyter_lab: false,
  jupyter_notebook: false,
  jupyter: false,
  sage: false,
  latex: false,
  rmd: false,
  x11: false,
  spellcheck: false,
  library: false
};

// derive available types of files from the configuration map
export function is_available(configuration?: ProjectConfiguration): Available {
  if (configuration == null) return NO_AVAIL;

  const main: Configuration | undefined = configuration.get("main");
  if (main == null) return NO_AVAIL;
  const capabilities = main.capabilities as Capabilities;
  if (capabilities == null) return NO_AVAIL;
  const jupyter: Capabilities | boolean = capabilities.jupyter;

  if (typeof jupyter !== "boolean") {
    const kernelspec: boolean = !!jupyter.kernelspec;
    return {
      jupyter_lab: kernelspec && !!jupyter.lab,
      jupyter_notebook: kernelspec && !!jupyter.notebook,
      jupyter: kernelspec,
      sage: !!capabilities.sagews,
      latex: !!capabilities.latex,
      rmd: !!capabilities.rmd,
      x11: !!capabilities.x11,
      spellcheck: !!capabilities.spellcheck,
      library: !!capabilities.library
    };
  } else {
    return NO_AVAIL;
  }
}

export async function get_configuration(
  webapp_client: any,
  project_id: string,
  aspect: ConfigurationAspect = "main",
  prev: ProjectConfiguration
): Promise<ProjectConfiguration | undefined> {
  // the actual API call, returning an object
  const config: Configuration = await webapp_client.configuration(
    project_id,
    aspect
  );
  // console.log("project_actions::init_configuration", aspect, config);

  if (aspect == ("main" as ConfigurationAspect)) {
    const caps = config.capabilities as Capabilities;
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
    // (the associated editors shouldn't initialize at all!)
    const disabled_ext = (config.disabled_ext = [] as string[]);
    if (!caps.jupyter) disabled_ext.push("ipynb");
    if (!caps.rmd) disabled_ext.push("rmd");
    if (!caps.latex) disabled_ext.push(...KNITR_EXTS.concat(["tex"]));
    if (!caps.sage) disabled_ext.push("sagews", "sage");
    if (!caps.x11) disabled_ext.push("x11");
  }

  if (config == null) return prev;
  if (prev != null) {
    const next = prev.set(aspect, config);
    // console.log("project_actions::configuration/next", next);
    return next;
  } else {
    // console.log("project_actions::configuration/upd", config);
    return iMap<ConfigurationAspect, Configuration>([[aspect, config]]);
  }
}
