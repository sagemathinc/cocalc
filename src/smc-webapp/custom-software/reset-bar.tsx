/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { props2img, RESET_ICON } from "./util";
import { ComputeImages } from "./init";
//const misc = require("smc-util/misc");
//import * as misc2 from "smc-util/misc2";
// const { open_new_tab } = require("smc-webapp/misc_page");
import {
  A,
  Icon,
  COLORS,
  //   Tip,
  //   HiddenXSSM,
  //   VisibleMDLG,
  //   VisibleXSSM
} from "../r_misc";
const { Button, Well, Row, Col, ButtonToolbar } = require("react-bootstrap");
import { Available as AvailableFeatures } from "../project_configuration";
import { ProjectMap } from "smc-webapp/todo-types";
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
  paddingBottom: "20px",
});

const button_bar_style: React.CSSProperties = Object.freeze({
  whiteSpace: "nowrap" as "nowrap",
});

const info_style: React.CSSProperties = Object.freeze({
  paddingBottom: "20px",
});

interface Props {
  project_id: string;
  images: ComputeImages;
  project_map?: ProjectMap;
  actions: any;
  available_features?: AvailableFeatures;
  site_name?: string;
}

export class CustomSoftwareReset extends React.Component<Props, {}> {
  reset = () => this.props.actions.custom_software_reset();

  cancel = () => this.props.actions.toggle_custom_software_reset(false);

  render = () => {
    const img = props2img(this.props);
    if (img == null) return;
    const NAME = this.props.site_name || SITE_NAME;

    return (
      <Well>
        <Row style={{ color: COLORS.GRAY_D }}>
          <Col sm={12} style={title_style}>
            <Icon name={RESET_ICON} /> Reset {img.get("display", "")}
          </Col>
          <Col sm={12} style={info_style}>
            <p>
              Clicking on "Reset" copies all accompanying files of this custom
              software environment into your home directory. This was done once
              when this project was created and you can repeat this action right
              now. If these accompanying files hosted on {NAME} did update in
              the meantime, you'll recieve the newer versions.
            </p>
            <p>
              Note, that this will overwrite any changes you did to these
              accompanying files, but does not modify or delete any other files.
              However, nothing is lost: you can still access the previous
              version via <A href={doc_snap}>Snapshot Backups</A> or{" "}
              <A href={doc_tt}>TimeTravel</A>.
            </p>
            <p>This action will also restart your project!</p>
          </Col>
          <Col sm={12} style={button_bar_style}>
            <ButtonToolbar>
              <Button onClick={this.reset} bsStyle={"danger"}>
                <Icon name={RESET_ICON} /> Reset and Restart
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
