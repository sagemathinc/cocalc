/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Col, Row } from "react-bootstrap";
// import { ProjectActions } from "../../project_actions";
import { project_websocket } from "../../frame-editors/generic/client";
import { ProjectInfo } from "smc-project/project-info/types";

interface Props {
  name: string;
  project_id: string;
  //  actions: ProjectActions;
}

function useProjectInfo(project_id: string, set_info: Function) {
  React.useEffect(() => {
    let conn: any = null;
    (async () => {
      const ws = await project_websocket(project_id);
      conn = await ws.api.project_info();
      conn.on("data", set_info);
    })();
    return () => {
      console.log("end project info");
      conn?.end();
    };
  }, []);
}

export function ProjectInfo({ project_id /*, actions*/ }: Props): JSX.Element {
  const [info, set_info] = React.useState<Partial<ProjectInfo>>({});
  useProjectInfo(project_id, set_info);

  return (
    <Row style={{ marginTop: "15px" }}>
      <Col md={12} mdOffset={0} lg={10} lgOffset={1}>
        <h1>Project Info</h1>
        <div>
          timestamp: <code>{info.timestamp}</code>
        </div>
        <pre style={{ fontSize: "10px" }}>{info.ps}</pre>
      </Col>
    </Row>
  );
}
