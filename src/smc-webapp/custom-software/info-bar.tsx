import { Component, React } from "../app-framework";
import { Map as iMap } from "immutable";
import {
  compute_image2basename,
  CUSTOM_IMG_PREFIX,
  CUSTOM_SOFTWARE_HELP_URL as help_url
} from "./util";
import { ComputeImages } from "./init";
const misc = require("smc-util/misc");
import * as misc2 from "smc-util/misc2";
const { open_new_tab } = require("smc-webapp/misc_page");
const {
  Icon,
  COLORS,
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

const title_style: React.CSSProperties = Object.freeze({
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as "nowrap",
  overflow: "hidden",
  paddingLeft: "10px",
  margin: "5px 10px",
  color: COLORS.GRAY
});

interface Props {
  project_id: string;
  images: ComputeImages;
  project_map: iMap<string, any>;
  actions: any;
  available_features: AvailableFeatures;
}

export class CustomSoftwareInfo extends Component<Props, {}> {
  render_path = path => {
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

  render_notebooks = () => {
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

        <Button
          onClick={() => this.props.actions.toggle_custom_software_reset(true)}
        >
          <Icon name={"broom"} /> <VisibleMDLG>Reset...</VisibleMDLG>
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
    if (this.props.project_map == null) return null;
    const ci = this.props.project_map.getIn([
      this.props.project_id,
      "compute_image"
    ]);
    if (ci == null) return null;
    if (!ci.startsWith(CUSTOM_IMG_PREFIX)) return null;
    if (this.props.images == null) return null;
    const img = this.props.images.get(compute_image2basename(ci));
    if (img == null) return null;
    const path = img.get("path", "");

    //const style: React.CSSProperties = Object.assign({}, ROW_INFO_STYLE, {
    //  paddingLeft: "10px",
    //  display: "inline-flex",
    //  color: COLORS.GRAY_D
    //});

    return (
      <>
        <ButtonGroup bsSize={"small"} style={{ whiteSpace: "nowrap" }}>
          {this.render_path(path)}
          {this.render_notebooks()}
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
