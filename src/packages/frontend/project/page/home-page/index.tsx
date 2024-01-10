/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "antd";

import { Title } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { COLORS } from "@cocalc/util/theme";
import { HomeRecentFiles } from "./recent-files";

export default function HomePage() {
  const { project_id, actions } = useProjectContext();

  return (
    <Row
      gutter={[30, 30]}
      style={{
        maxWidth: "800px",
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
            style={{
              cursor: "pointer",
              textAlign: "center",
              color: COLORS.GRAY_M,
            }}
          >
            <ProjectTitle project_id={project_id} noClick />
          </Title>
        </div>
      </Col>
      <Col md={24}>
        <HomeRecentFiles
          project_id={project_id}
          style={{ height: "400px" }}
          mode="embed"
        />
      </Col>
    </Row>
  );
}
