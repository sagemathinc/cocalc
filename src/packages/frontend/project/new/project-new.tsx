/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { CSS } from "@cocalc/frontend/app-framework";
import { useProjectContext } from "@cocalc/frontend/project/context";
import NewFilePage from "./new-file-page";

interface Props {
  project_id: string;
}

export function ProjectNew({ project_id }: Props): JSX.Element {
  const { mainWidthPx } = useProjectContext();

  const isWide = mainWidthPx > 800;
  const offset = isWide ? 1 : 0;
  const style: CSS = isWide ? {} : { marginLeft: "10px", marginRight: "10px" };

  return (
    <Row style={style}>
      <Col md={12} mdOffset={0} lg={12 - 2 * offset} lgOffset={offset}>
        <NewFilePage project_id={project_id} />
      </Col>
    </Row>
  );
}
