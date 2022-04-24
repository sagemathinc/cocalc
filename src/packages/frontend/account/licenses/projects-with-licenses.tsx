/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Row, Col } from "antd";
import {
  React,
  useMemo,
  useTypedRedux,
  useEffect,
  redux,
} from "../../app-framework";
import { Loading, TimeAgo } from "../../components";
import { projects_with_licenses } from "./util";
import { plural, trunc_middle } from "@cocalc/util/misc";
import { LICENSES_STYLE } from "./managed-licenses";
import { Virtuoso } from "react-virtuoso";

function open_project(project_id: string): void {
  redux.getActions("projects").open_project({ project_id });
  redux.getProjectActions(project_id).set_active_tab("settings");
}

export const ProjectsWithLicenses: React.FC = () => {
  const project_map = useTypedRedux("projects", "project_map");
  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded"
  );
  const projects = useMemo(
    () => projects_with_licenses(project_map),
    [project_map]
  );

  useEffect(() => {
    if (!all_projects_have_been_loaded) {
      // Mounted this component, but all projects aren't loaded, so ensure they get loaded.
      redux.getActions("projects").load_all_projects();
    }
  }, []);

  function row_renderer({ index }) {
    const { project_id, last_edited, num_licenses } = projects[index];
    return (
      <Row
        key={projects[index]?.project_id}
        style={{ borderBottom: "1px solid lightgrey", cursor: "pointer" }}
        onClick={() => {
          open_project(project_id);
        }}
      >
        <Col span={12} style={{ paddingLeft: "15px" }}>
          <a>
            {trunc_middle(project_map?.getIn([project_id, "title"]) ?? "", 80)}
          </a>
        </Col>
        <Col span={6}>
          {num_licenses} {plural(num_licenses, "License")}
        </Col>
        <Col span={6}>{last_edited && <TimeAgo date={last_edited} />}</Col>
      </Row>
    );
  }

  function render_projects_with_license() {
    if (projects == null || projects.length == 0) {
      return (
        <span>
          You do not have any licensed projects yet. Please purchase a license
          or apply a license to one of your projects in Project Settings.
        </span>
      );
    }
    return (
      <div
        style={{ ...LICENSES_STYLE, height: "50vh" }}
        className={"smc-vfill"}
      >
        <Virtuoso
          totalCount={projects.length}
          itemContent={(index) => row_renderer({ index })}
        />
        {!all_projects_have_been_loaded && <Loading theme={"medium"} />}
      </div>
    );
  }

  function render_count() {
    if (projects == null || projects.length == 0) return;
    return <>({projects.length})</>;
  }

  return (
    <div>
      {" "}
      <h3>Projects with licenses {render_count()}</h3>
      {render_projects_with_license()}
    </div>
  );
};
