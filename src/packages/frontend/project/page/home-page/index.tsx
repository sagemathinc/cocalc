/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "antd";

import { useActions } from "@cocalc/frontend/app-framework";
import { Title } from "@cocalc/frontend/components";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { useProjectContext } from "../../context";
import { HomeRecentFiles } from "./recent-files";

export default function HomePage() {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });

  return (
    <Row
      gutter={[30, 30]}
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "15px",
      }}
    >
      <Col md={24}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Title
            level={2}
            onClick={() => actions?.set_active_tab("settings")}
            style={{ cursor: "pointer", textAlign: "center", color: "#666" }}
          >
            <ProjectTitle project_id={project_id} noClick />
          </Title>
        </div>
      </Col>
      <Col md={24}>
        <HomeRecentFiles project_id={project_id} style={{ height: "400px" }} mode="embed" />
      </Col>
    </Row>
  );
}
