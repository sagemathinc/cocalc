/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Col, Row } from "antd";
import { useState } from "react";

import {
  redux,
  useActions,
  useEffect,
  useRedux,
} from "@cocalc/frontend/app-framework";
import { Title } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { ProjectLog } from "@cocalc/frontend/project/history";
import ProjectImage from "@cocalc/frontend/project/settings/image";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import ChatGPTGenerateJupyterNotebook from "./chatgpt-generate-jupyter";
import { Block } from "./block";

/*
import { Explorer } from "@cocalc/frontend/project/explorer";
import { ProjectNew } from "@cocalc/frontend/project/new";
import { ProjectInfo } from "@cocalc/frontend/project/info";
      <Block>
        <Explorer project_id={project_id} />
      </Block>
      <Block>
        <ProjectNew project_id={project_id} />
      </Block>
      <Block>
        <ProjectInfo project_id={project_id} />
      </Block>
      */

export default function HomePage({ project_id }) {
  const desc = useRedux(["projects", "project_map", project_id, "description"]);
  const actions = useActions({ project_id });
  const [error, setError] = useState<string>("");
  const [avatarImage, setAvatarImage] = useState<string | undefined>(undefined);
  useEffect(() => {
    (async () => {
      setAvatarImage(
        await redux.getStore("projects").getProjectAvatarImage(project_id)
      );
    })();
  }, []);

  return (
    <div style={{ margin: "15px" }}>
      <Row gutter={[30, 30]}>
        <Col span={12} style={{ textAlign: "center" }}>
          <Title
            level={2}
            onClick={() => actions?.set_active_tab("settings")}
            style={{ cursor: "pointer" }}
          >
            <ProjectTitle project_id={project_id} noClick />
          </Title>
          {error && (
            <Alert
              style={{ marginTop: "15px" }}
              type="error"
              message={error}
              showIcon
            />
          )}
          <ProjectImage
            avatarImage={avatarImage}
            onChange={async (data) => {
              try {
                await redux
                  .getActions("projects")
                  .setProjectImage(project_id, data);
                setAvatarImage(data.full);
              } catch (err) {
                setError(`Error saving project image: ${err}`);
              }
            }}
          />
        </Col>
        <Col
          span={12}
          style={{
            flex: 1,
            cursor: "pointer",
            maxHeight: "300px",
            overflow: "auto",
          }}
          onClick={() => actions?.set_active_tab("settings")}
        >
          <StaticMarkdown value={desc} />
        </Col>
        <Col span={12}>
          <ChatGPTGenerateJupyterNotebook project_id={project_id} />
        </Col>
        <Col span={12}>
          <Block style={{ margin: "auto" }}>
            <ProjectLog project_id={project_id} />
          </Block>
        </Col>
      </Row>
    </div>
  );
}
