/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// in "Files", this shows some information and action buttons related to the custom software environment

import { Map as iMap } from "immutable";
import {
  CUSTOM_SOFTWARE_HELP_URL as help_url,
  title_style,
  props2img,
  RESET_ICON,
} from "./util";
import { ComputeImages } from "./init";
import { path_split, trunc, trunc_middle } from "@cocalc/util/misc";
import { open_new_tab } from "../misc";
import { Icon, Tip, HiddenXSSM, VisibleMDLG, VisibleXSSM } from "../components";
import { Button } from "antd";
import { Available as AvailableFeatures } from "../project_configuration";
import { serverURL } from "../project/named-server-panel";
import LinkRetry from "../components/link-retry";

interface Props {
  project_id: string;
  images: ComputeImages;
  project_map: iMap<string, any>;
  actions: any;
  available_features: AvailableFeatures;
  show_custom_software_reset: boolean;
  project_is_running: boolean;
}

export const CustomSoftwareInfo: React.FC<Props> = (props: Props) => {
  const {
    project_id,
    actions,
    available_features,
    show_custom_software_reset,
    project_is_running,
  } = props;

  function render_path(path) {
    if (!project_is_running) return null;
    if (path.length === 0) return null;

    const onClick = path.endsWith("/")
      ? () => actions.open_directory(path)
      : () => actions.open_file({ path: path });

    // boil down what user sees as the launch button description
    const display_path = path.endsWith("/")
      ? path.slice(0, -1)
      : path_split(path).tail;

    return (
      <Button onClick={onClick} >
        <Tip title={`Open '${path}'`} placement={"bottom"}>
          <Icon name={"rocket"} />{" "}
          <VisibleMDLG>{trunc_middle(display_path, 40)}</VisibleMDLG>
        </Tip>
      </Button>
    );
  }

  function reset() {
    actions.toggle_custom_software_reset(!show_custom_software_reset);
  }

  function render_jupyter(): JSX.Element | null {
    if (available_features == null) return null;

    const href_jupyterlab = serverURL(project_id, "jupyterlab");
    const href_jupyterclassic = serverURL(project_id, "jupyter");

    const have_jupyterlab = available_features.jupyter_lab || false;
    const have_jupyterclassic = available_features.jupyter_notebook || false;

    return (
      <>
        {have_jupyterclassic ? (
          <LinkRetry mode="button" href={href_jupyterclassic}>
            <Tip
              title={"Start the classical Jupyter server"}
              placement={"bottom"}
            >
              <Icon name={"ipynb"} /> <HiddenXSSM>Jupyter</HiddenXSSM>
            </Tip>
          </LinkRetry>
        ) : undefined}
        {have_jupyterlab ? (
          <LinkRetry mode="button" href={href_jupyterlab}>
            <Tip title={"Start Jupyter Lab server"} placement={"bottom"}>
              <Icon name={"ipynb"} /> <VisibleMDLG>JupyterLab</VisibleMDLG>
              <VisibleXSSM>Lab</VisibleXSSM>
            </Tip>
          </LinkRetry>
        ) : undefined}

        <Button  onClick={reset}>
          <Icon name={RESET_ICON} /> <VisibleMDLG>Reset...</VisibleMDLG>
        </Button>

        <Button  onClick={() => open_new_tab(help_url)}>
          <Icon name={"question-circle"} />
        </Button>
      </>
    );
  }

  function img_info(img) {
    const disp = img.get("display", "");
    const id = img.get("id", "");
    return `${disp} (${id})`;
  }

  const img = props2img(props);
  if (img == null) return null;
  const path = img.get("path", "");

  return (
    <>
      <div style={{ whiteSpace: "nowrap" }}>
        {render_path(path)}
        {render_jupyter()}
      </div>
      <div style={title_style}>
        <Tip title={img_info(img)} placement={"bottom"}>
          {trunc(img.get("display", ""), 100)}
        </Tip>
      </div>
    </>
  );
};
