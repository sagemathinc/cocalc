/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import NewFilePage from "./new-file-page";

interface Props {
  project_id: string;
}

export function ProjectNew({ project_id }: Props): JSX.Element {
  return (
    <Row style={{ marginTop: "15px" }}>
      <Col md={12} mdOffset={0} lg={10} lgOffset={1}>
        <NewFilePage project_id={project_id} />
      </Col>
    </Row>
  );
}
