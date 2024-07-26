/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card, Col, Row } from "antd";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, Title } from "@cocalc/frontend/components";
import {
  ComputeServerDocs,
  ComputeServers,
  computeServersEnabled,
} from "@cocalc/frontend/compute";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import AccountStatus from "@cocalc/frontend/purchases/account-status";
import { useProjectContext } from "../../context";
import { HomeRecentFiles } from "./recent-files";

const SPAN = { md: 12, sm: 24, xs: 24 } as const;

export default function HomePage() {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const commercial = useTypedRedux("customize", "commercial");

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
                  <ComputeServerDocs style={{ float: "right" }} />
                  <Icon
                    name="servers"
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
        {commercial && (
          <Col md={24}>
            <AccountStatus compact style={{ border: "1px solid #ddd" }} />
          </Col>
        )}
      </Row>
    </div>
  );
}
