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

import { React, Redux, rclass, rtypes } from "../app-framework";
import { Col, Row } from "../antd-bootstrap";
import { Icon, Space } from "../r_misc";
import { SiteDescription, Footer } from "../customize";

const { ComputeEnvironment } = require("../compute_environment");

import { COLORS } from "smc-util/theme";

import { SUPPORT_LINKS, CONNECT_LINKS, ABOUT_LINKS } from "./links";
import { LinkList } from "./link-list";
import { Usage } from "./usage";
import { ThirdPartySoftware } from "./third-party";

interface InfoPageElementReduxProps {
  is_cocalc_com: boolean;
  help_email: string;
  site_name: string;
  logo_square: string;
  logo_rectangular: string;
}

const InfoPageElement = rclass<{}>(
  class InfoPageComponent extends React.Component<InfoPageElementReduxProps> {
    public static reduxProps = () => {
      return {
        customize: {
          help_email: rtypes.string,
          is_cocalc_com: rtypes.bool,
          site_name: rtypes.string,
          logo_square: rtypes.string,
          logo_rectangular: rtypes.string
        }
      };
    };

    private render_noncomm_logo() {
      if (this.props.logo_square.length > 0) {
        return (
          <React.Fragment>
            <div>
              <img
                src={this.props.logo_square}
                style={{ width: "25%", height: "auto" }}
              />
            </div>
            {this.props.logo_rectangular.length > 0 ? (
              <div>
                <img
                  src={this.props.logo_rectangular}
                  style={{ width: "20%", height: "auto" }}
                />
              </div>
            ) : (
              undefined
            )}
          </React.Fragment>
        );
      } else {
        return (
          <div>
            <h1>{this.props.site_name}</h1>
          </div>
        );
      }
    }

    public render() {
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
              {this.props.is_cocalc_com ? (
                <img
                  src={`${APP_LOGO}`}
                  style={{ width: "33%", height: "auto" }}
                />
              ) : (
                this.render_noncomm_logo()
              )}
              <br />
              <SiteDescription />
            </h3>

            {this.props.is_cocalc_com ? (
              <div style={banner_style}>
                <Icon name="medkit" />
                <Space />
                <Space />
                <strong>
                  In case of any questions or problems, <em>do not hesitate</em>{" "}
                  to create a <ShowSupportLink />.
                </strong>
                <br />
                We want to know if anything is broken!
              </div>
            ) : (
              this.props.help_email.length > 0 && (
                <div style={banner_style}>
                  Help:{" "}
                  <a href={`mailto:${this.props.help_email}`}>
                    {this.props.help_email}
                  </a>
                </div>
              )
            )}

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
              {this.props.is_cocalc_com ? (
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
            <Row>
              <ComputeEnvironment />
            </Row>
          </Col>
          <Col sm={1} md={2} xsHidden></Col>
          <Col xs={12} sm={12} md={12}>
            <Footer />
          </Col>
        </Row>
      );
    }
  }
);

export function InfoPage() {
  return (
    <Redux>
      <InfoPageElement />
    </Redux>
  );
}

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

export const _test = {
  HelpPageSupportSection: (
    <LinkList title="Help & Support" icon="support" links={SUPPORT_LINKS} />
  ),
  ConnectSection: (
    <LinkList title="Connect" icon="plug" links={CONNECT_LINKS} />
  ),
  SUPPORT_LINKS,
  CONNECT_LINKS
};
