/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Card, Col, Row } from "antd";

import { redux, useActions } from "@cocalc/frontend/app-framework";
import { Icon, Title } from "@cocalc/frontend/components";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { useProjectContext } from "../../context";
import ChatGPTGenerateJupyterNotebook from "./chatgpt-generate-jupyter";
import { HomeRecentFiles } from "./recent-files";
import {
  computeServersEnabled,
  ComputeServers,
} from "@cocalc/frontend/compute";
import AccountStatus from "@cocalc/frontend/purchases/account-status";

const SPAN = { md: 12, sm: 24, xs: 24 } as const;

export default function HomePage() {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });

  function renderGPTGenerator() {
    // if not available, the entire block should be gone
    // making room for the toher blocks to move into its place
    if (!redux.getStore("projects").hasOpenAI(project_id)) return null;

    return (
      <Col {...SPAN}>
        <ChatGPTGenerateJupyterNotebook project_id={project_id} />
      </Col>
    );
  }

  return (
    <div style={{ margin: "15px", maxWidth: "1300px" }}>
      <Row gutter={[30, 30]}>
        <Col {...SPAN}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "200px",
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
        <Col {...SPAN}>
          <HomeRecentFiles
            project_id={project_id}
            style={{ height: "200px" }}
          />
        </Col>
        {computeServersEnabled() && (
          <Col {...SPAN}>
            <Card
              style={{
                maxHeight: "500px",
                overflow: "auto",
                border: "1px solid #ddd",
              }}
              title={
                <Title level={4}>
                  <Icon
                    name="server"
                    style={{ fontSize: "20pt", marginRight: "5px" }}
                  />{" "}
                  Compute Servers
                </Title>
              }
            >
              <ComputeServers project_id={project_id} />
            </Card>
          </Col>
        )}
        {renderGPTGenerator()}
        <Col {...SPAN}>
          <AccountStatus compact style={{ border: "1px solid #ddd" }} />
        </Col>
      </Row>
    </div>
  );
}
