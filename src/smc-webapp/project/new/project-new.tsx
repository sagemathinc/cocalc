
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
