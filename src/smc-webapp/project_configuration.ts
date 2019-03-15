// manages project configuration aspects
import { Map as iMap, fromJS } from "immutable";
import { ConfigurationAspect } from "project/websocket/api";
import { KNITR_EXTS } from "frame-editors/latex-editor/util";

export type Configuration = { [key: string]: object };
export type Capabilities = {
  [key: string]: boolean | Capabilities | Capabilities;
};

export interface MainCapabilities {
  jupyter: boolean | Capabilities;
  latex: boolean;
  sagews: boolean;
  x11: boolean;
  rnw: boolean;
  rmd: boolean;
  spellcheck: boolean;
}

export interface Available {
  jupyter_lab: boolean;
  jupyter_notebook: boolean;
  jupyter: boolean;
  x11: boolean;
  latex: boolean;
  sagews: boolean;
  rmd: boolean; // TODO besides R, what's necessary?
  spellcheck: boolean;
}

const NO_AVAIL: Available = {
  jupyter_lab: false,
  jupyter_notebook: false,
  jupyter: false,
  sagews: false,
  latex: false,
  rmd: false,
  x11: false,
  spellcheck: false
};

// derive available types of files from the configuration map
export function is_available(configuration?: iMap<string, any>): Available {
  if (configuration == null) return NO_AVAIL;

  const capabilities: iMap<string, any> = configuration.getIn([
    "main",
    "capabilities"
  ]);
  if (capabilities == null) return NO_AVAIL;
  const jupyter: iMap<string, any> | boolean = configuration.getIn(
    ["main", "capabilities", "jupyter"],
    false
  );

  if (typeof jupyter !== "boolean") {
    const kernelspec: boolean = jupyter.get("kernelspec", false);
    return {
      jupyter_lab: kernelspec && jupyter.get("lab", false),
      jupyter_notebook: kernelspec && jupyter.get("notebook", false),
      jupyter: kernelspec,
      sagews: capabilities.get("sagews", false),
      latex: capabilities.get("latex", false),
      rmd: capabilities.get("rmd", false),
      x11: capabilities.get("x11", false),
      spellcheck: capabilities.get("spellcheck", false)
    };
  } else {
    return NO_AVAIL;
  }
}

export async function get_configuration(
  webapp_client: any,
  project_id: string,
  aspect: ConfigurationAspect = "main",
  prev: iMap<string, any>
): Promise<iMap<string, any> | undefined> {
  // the actual API call, returning an object
  const config: Configuration = await webapp_client.configuration(
    project_id,
    aspect
  );
  // console.log("project_actions::init_configuration", aspect, config);

  if (aspect == ("main" as ConfigurationAspect)) {
    const caps = config.capabilities as Capabilities;
    // TEST x11/latex disabilities
    // caps.x11 = false;
    // caps.latex = false;

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
    if (!caps.latex) disabled_ext.push(...KNITR_EXTS.concat(["tex"]));
    if (!caps.sagews) disabled_ext.push("sagews");
    if (!caps.x11) disabled_ext.push("x11");
  }

  const upd = fromJS({ [aspect]: config });
  if (upd == null) return undefined;
  if (prev != null) {
    const next = prev.merge(upd) as iMap<string, any>;
    // console.log("project_actions::configuration/next", next);
    return next;
  } else {
    // console.log("project_actions::configuration/upd", upd);
    return upd;
  }
}
