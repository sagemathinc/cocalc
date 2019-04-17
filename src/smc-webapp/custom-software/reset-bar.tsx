import { Component, React } from "../app-framework";
import { Map as iMap } from "immutable";
import { props2img, RESET_ICON } from "./util";
import { ComputeImages } from "./init";
//const misc = require("smc-util/misc");
//import * as misc2 from "smc-util/misc2";
// const { open_new_tab } = require("smc-webapp/misc_page");
const {
  A,
  Icon,
  COLORS
  //   Tip,
  //   HiddenXSSM,
  //   VisibleMDLG,
  //   VisibleXSSM
} = require("../r_misc");
const { Button, Well, Row, Col, ButtonToolbar } = require("react-bootstrap");
import { Available as AvailableFeatures } from "../project_configuration";
const { SITE_NAME } = require("smc-util/theme");

const doc_snap = "https://doc.cocalc.com/project-files.html#snapshots";
const doc_tt = "https://doc.cocalc.com/time-travel.html";

//const bar_style: React.CSSProperties = Object.freeze({
//  flex: "1 0 auto",
//  marginTop: "10px",
//  marginBottom: "20px",
//  padding: "5px"
//});

const title_style: React.CSSProperties = Object.freeze({
  fontWeight: "bold" as "bold",
  fontSize: "15pt",
  paddingBottom: "20px"
});

const button_bar_style: React.CSSProperties = Object.freeze({
  whiteSpace: "nowrap" as "nowrap"
});

const info_style: React.CSSProperties = Object.freeze({
  paddingBottom: "20px"
});

interface Props {
  project_id: string;
  images: ComputeImages;
  project_map: iMap<string, any>;
  actions: any;
  available_features: AvailableFeatures;
  site_name: string;
}

export class CustomSoftwareReset extends Component<Props, {}> {
  private props2img;

  constructor(props) {
    super(props);
    this.props2img = props2img.bind(this);
  }

  reset = () => {
    window.alert("reset");
  };

  cancel = () => {
    this.props.actions.toggle_custom_software_reset(false);
  };

  render = () => {
    const img = this.props2img();
    if (img == null) return;
    const NAME = this.props.site_name || SITE_NAME;

    return (
      <Well>
        <Row style={{ color: COLORS.GRAY }}>
          <Col sm={12} style={title_style}>
            <Icon name={RESET_ICON} /> Reset {img.get("display", "")}
          </Col>
          <Col sm={12} style={info_style}>
            This operations copies all accompanying files of this custom
            software environment into your home directory. If the version hosted
            on {NAME} did update in the meantime, you'll recieve those updates.
            Note, that this will overwrite any changes you did to your files in
            your project. However, nothing is lost: you can still access the
            previous version via {A(doc_snap, "Snapshot Backups")} or{" "}
            {A(doc_tt, "TimeTravel")}.
          </Col>
          <Col sm={12} style={button_bar_style}>
            <ButtonToolbar>
              <Button onClick={this.reset} bsStyle={"primary"}>
                <Icon name={RESET_ICON} /> Reset
              </Button>
              <Button onClick={this.cancel}>
                <Icon name={"times-circle"} /> Cancel
              </Button>
            </ButtonToolbar>
          </Col>
        </Row>
      </Well>
    );
  };
}
