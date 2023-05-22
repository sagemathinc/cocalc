/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "antd";

import { redux, useActions, useRedux } from "@cocalc/frontend/app-framework";
import { Title } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import ChatGPTGenerateJupyterNotebook from "./chatgpt-generate-jupyter";
import { HomeRecentFiles } from "./recent-files";

const SPAN = { md: 12, sm: 24, xs: 24 } as const;

export default function HomePage({ project_id }) {
  const desc = useRedux(["projects", "project_map", project_id, "description"]);
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
          <Title
            level={2}
            onClick={() => actions?.set_active_tab("settings")}
            style={{ cursor: "pointer", textAlign: "center" }}
          >
            <ProjectTitle project_id={project_id} noClick />
          </Title>
        </Col>
        <Col>
          <div
            style={{
              flex: 1,
              cursor: "pointer",
              maxHeight: "10em",
              overflow: "auto",
            }}
            onClick={() => actions?.set_active_tab("settings")}
          >
            <StaticMarkdown value={desc} />
          </div>
        </Col>

        <Col {...SPAN}>
          <HomeRecentFiles project_id={project_id} />
        </Col>
        {renderGPTGenerator()}
      </Row>
    </div>
  );
}
