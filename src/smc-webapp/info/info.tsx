/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

/*
 * Info Page
 */

import { React, rclass } from "../app-framework";
import { Col, Row } from "../antd-bootstrap";
import { Icon, Space, Footer } from "../r_misc";
import { SiteDescription } from "../customize";

const { ComputeEnvironment } = require("../compute_environment");

import { COLORS } from "smc-util/theme";

import {
  SUPPORT_LINKS,
  CONNECT_LINKS,
  THIRD_PARTY,
  ABOUT_LINKS
} from "./links";
import { LinkList } from "./link-list";
import { Usage } from "./usage";


const ThirdPartySoftware = rclass({
  displayName: "Help-ThirdPartySoftware",
  render() {
    return (
      <LinkList title="Software" icon="question-circle" links={THIRD_PARTY} />
    );
  }
} as any);

export function render_static_third_party_software() {
  return (
    <LinkList title="" icon="question-circle" width={12} links={THIRD_PARTY} />
  );
}

let _HelpPage = rclass({
  displayName: "HelpPage",

  render_compute_env() {
    return (
      <Row>
        <ComputeEnvironment />
      </Row>
    );
  },

  render() {
    const banner_style: React.CSSProperties = {
      backgroundColor: "white",
      padding: "15px",
      border: `1px solid ${COLORS.GRAY}`,
      borderRadius: "5px",
      margin: "20px 0",
      width: "100%",
      fontSize: "115%",
      textAlign: "center",
      marginBottom: "30px"
    };

    // imports stuff that can't be imported in update_react_static.
    const { ShowSupportLink } = require("../support");
    const { APP_LOGO } = require("../art");

    return (
      <Row style={{ padding: "10px", margin: "0px", overflow: "auto" }}>
        <Col sm={10} smOffset={1} md={8} mdOffset={2} xs={12}>
          <h3 style={{ textAlign: "center", marginBottom: "30px" }}>
            <img src={`${APP_LOGO}`} style={{ width: "33%", height: "auto" }} />
            <br />
            <SiteDescription />
          </h3>

          <div style={banner_style}>
            <Icon name="medkit" />
            <Space />
            <Space />
            <strong>
              In case of any questions or problems, <em>do not hesitate</em> to
              create a <ShowSupportLink />.
            </strong>
            <br />
            We want to know if anything is broken!
          </div>

          <Row>
            <LinkList
              title="Help and support"
              icon="support"
              links={SUPPORT_LINKS}
            />
            <LinkList title="Connect" icon="plug" links={CONNECT_LINKS} />
          </Row>
          <Row style={{ marginTop: "20px" }}>
            <ThirdPartySoftware />
            <Usage />
          </Row>
          <Row>
            {require("../customize").commercial ? (
              <LinkList
                title="About"
                icon="info-circle"
                links={ABOUT_LINKS}
                width={12}
              />
            ) : (
              undefined
            )}
          </Row>
          {this.render_compute_env()}
        </Col>
        <Col sm={1} md={2} xsHidden></Col>
        <Col xs={12} sm={12} md={12}>
          <Footer />
        </Col>
      </Row>
    );
  }
} as any);

export { _HelpPage as HelpPage };

export function render_static_about() {
  return (
    <Col>
      <Row>
        <LinkList title="Help & Support" icon="support" links={SUPPORT_LINKS} />
        <LinkList title="Connect" icon="plug" links={CONNECT_LINKS} />
      </Row>
      <Row style={{ marginTop: "20px" }}>
        <ThirdPartySoftware />
        <Usage />
      </Row>
    </Col>
  );
}

export let _test = {
  HelpPageSupportSection: (
    <LinkList title="Help & Support" icon="support" links={SUPPORT_LINKS} />
  ),
  ConnectSection: (
    <LinkList title="Connect" icon="plug" links={CONNECT_LINKS} />
  ),
  SUPPORT_LINKS,
  CONNECT_LINKS
};

