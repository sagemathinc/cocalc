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

import { Col, Row } from "react-bootstrap";

import { ProjectActions } from "../../project_actions";

import { ProjectNewForm } from "./project-new-form";

interface Props {
  name: string;
  project_id: string;
  actions: ProjectActions;
}

export function ProjectNew({ name, project_id, actions }: Props): JSX.Element {
  return (
    <Row style={{ marginTop: "15px" }}>
      <Col md={12} mdOffset={0} lg={10} lgOffset={1}>
        <ProjectNewForm project_id={project_id} name={name} actions={actions} />
      </Col>
    </Row>
  );
}
