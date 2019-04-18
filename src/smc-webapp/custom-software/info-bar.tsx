import { Component, React } from "../app-framework";
import { Map as iMap } from "immutable";
import {
  CUSTOM_SOFTWARE_HELP_URL as help_url,
  title_style,
  props2img,
  RESET_ICON
} from "./util";
import { ComputeImages } from "./init";
const misc = require("smc-util/misc");
import * as misc2 from "smc-util/misc2";
const { open_new_tab } = require("smc-webapp/misc_page");
const {
  Icon,
  Tip,
  HiddenXSSM,
  VisibleMDLG,
  VisibleXSSM
} = require("../r_misc");
const { ButtonGroup, Button } = require("react-bootstrap");
import { Available as AvailableFeatures } from "../project_configuration";
//const { ROW_INFO_STYLE } = require("../project_files");
const { jupyterlab_server_url } = require("../project/jupyterlab-server");
const { jupyter_server_url } = require("../editor_jupyter");
const { ButtonRetryUntilSuccess } = require("../widgets-misc/link-retry");

interface Props {
  project_id: string;
  images: ComputeImages;
  project_map: iMap<string, any>;
  actions: any;
  available_features: AvailableFeatures;
  show_custom_software_reset: boolean;
  project_is_running: boolean;
}

export class CustomSoftwareInfo extends Component<Props, {}> {
  private props2img;

  constructor(props) {
    super(props);
    this.props2img = props2img.bind(this);
  }

  render_path = path => {
    if (!this.props.project_is_running) return null;
    if (path.length === 0) return null;

    const onClick = (() => {
      if (path.endsWith("/")) {
        return () => this.props.actions.open_directory(path);
      } else {
        return () => this.props.actions.open_file({ path: path });
      }
    })();

    // boil down what user sees as the launch button description
    const display_path = path.endsWith("/")
      ? path.slice(0, -1)
      : misc2.path_split(path).tail;

    return (
      <Button onClick={onClick}>
        <Tip title={`Open '${path}'`} placement={"bottom"}>
          <Icon name={"rocket"} />{" "}
          <VisibleMDLG>{misc.trunc_middle(display_path, 40)}</VisibleMDLG>
        </Tip>
      </Button>
    );
  };

  reset = () =>
    this.props.actions.toggle_custom_software_reset(
      !this.props.show_custom_software_reset
    );

  render_jupyter = () => {
    if (this.props.available_features == null) return null;

    const href_jl = async () =>
      await jupyterlab_server_url(this.props.project_id);
    const href_jc = async () => await jupyter_server_url(this.props.project_id);

    const have_jl = this.props.available_features.jupyter_lab || false;
    const have_jc = this.props.available_features.jupyter_notebook || false;

    return (
      <>
        {have_jc ? (
          <ButtonRetryUntilSuccess get_href={href_jc}>
            <Tip
              title={"Start the classical Jupyter server"}
              placement={"bottom"}
            >
              <Icon name={"cc-icon-ipynb"} /> <HiddenXSSM>Jupyter</HiddenXSSM>
            </Tip>
          </ButtonRetryUntilSuccess>
        ) : (
          undefined
        )}
        {have_jl ? (
          <ButtonRetryUntilSuccess get_href={href_jl}>
            <Tip title={"Start Jupyter Lab server"} placement={"bottom"}>
              <Icon name={"cc-icon-ipynb"} />{" "}
              <VisibleMDLG>JupyterLab</VisibleMDLG>
              <VisibleXSSM>Lab</VisibleXSSM>
            </Tip>
          </ButtonRetryUntilSuccess>
        ) : (
          undefined
        )}

        <Button onClick={this.reset}>
          <Icon name={RESET_ICON} /> <VisibleMDLG>Reset...</VisibleMDLG>
        </Button>

        <Button onClick={() => open_new_tab(help_url)}>
          <Icon name={"question-circle"} />
        </Button>
      </>
    );
  };

  img_info = img => {
    const disp = img.get("display", "");
    const id = img.get("id", "");
    return `${disp} (${id})`;
  };

  render = () => {
    const img = this.props2img();
    if (img == null) return null;
    const path = img.get("path", "");

    return (
      <>
        <ButtonGroup bsSize={"small"} style={{ whiteSpace: "nowrap" }}>
          {this.render_path(path)}
          {this.render_jupyter()}
        </ButtonGroup>
        <div style={title_style}>
          <Tip title={this.img_info(img)} placement={"bottom"}>
            {misc2.trunc(img.get("display", ""), 100)}
          </Tip>
        </div>
      </>
    );
  };
}
