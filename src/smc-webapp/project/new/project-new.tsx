/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
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
import * as React from "react";
import { rtypes, rclass } from "../../app-framework";

import { Col, Row } from "react-bootstrap";

export const ProjectNew = rclass(function({ name }) {
  return {
    propTypes: {
      project_id: rtypes.string
    },

    render() {
      return (
        <Row style={{ marginTop: "15px" }}>
          <Col md={12} mdOffset={0} lg={10} lgOffset={1}>
            <ProjectNewForm
              project_id={this.props.project_id}
              name={name}
              actions={this.actions(name)}
            />
          </Col>
        </Row>
      );
    }
  };
});
