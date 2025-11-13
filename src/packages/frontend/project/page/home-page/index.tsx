/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Col, Row, Space } from "antd";

import useAppContext from "@cocalc/frontend/app/use-context";
import { Icon, Title } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { COLORS } from "@cocalc/util/theme";
import { FIXED_PROJECT_TABS } from "../file-tab";
import { HomeRecentFiles } from "./recent-files";

const BTN_PROPS = {
  block: true,
  width: "50%",
  size: "large",
  style: { backgroundColor: COLORS.GRAY_LLL },
  overflow: "hidden",
} as const;

export default function HomePage() {
  const { displayI18N: display } = useAppContext();
  const { project_id, actions } = useProjectContext();

  return (
    <Row
      gutter={[30, 30]}
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "10px",
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
      <Col md={24} style={{ textAlign: "center" }}>
        <Space.Compact>
          <Button
            {...BTN_PROPS}
            onClick={() => {
              actions?.set_active_tab("new");
            }}
          >
            <Icon name={FIXED_PROJECT_TABS.new.icon} /> Create a new file ...
          </Button>
          <Button
            {...BTN_PROPS}
            onClick={() => {
              actions?.set_active_tab("files");
            }}
          >
            <Icon name={FIXED_PROJECT_TABS.files.icon} /> Browse existing files
            ...
          </Button>
        </Space.Compact>
      </Col>
      <Col md={24} style={{ textAlign: "center" }}>
        <Button type="text" onClick={() => actions?.set_active_tab("log")}>
          <Icon name={FIXED_PROJECT_TABS.log.icon} />{" "}
          {display(FIXED_PROJECT_TABS.log.label)}
        </Button>
        <Button type="text" onClick={() => actions?.set_active_tab("users")}>
          <Icon name={FIXED_PROJECT_TABS.users.icon} />{" "}
          {display(FIXED_PROJECT_TABS.users.label)}
        </Button>
        <Button type="text" onClick={() => actions?.set_active_tab("upgrades")}>
          <Icon name={FIXED_PROJECT_TABS.upgrades.icon} />{" "}
          {display(FIXED_PROJECT_TABS.upgrades.label)}
        </Button>
        <Button type="text" onClick={() => actions?.set_active_tab("servers")}>
          <Icon name={FIXED_PROJECT_TABS.servers.icon} />{" "}
          {display(FIXED_PROJECT_TABS.servers.label)}
        </Button>
        <Button type="text" onClick={() => actions?.set_active_tab("settings")}>
          <Icon name={FIXED_PROJECT_TABS.settings.icon} />{" "}
          {display(FIXED_PROJECT_TABS.settings.label)}
        </Button>
      </Col>
      <Col md={24}>
        <HomeRecentFiles
          project_id={project_id}
          style={{ height: "max(200px, 50%)" }}
          mode="embed"
        />
      </Col>
    </Row>
  );
}
