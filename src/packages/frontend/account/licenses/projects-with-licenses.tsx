/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Col, Row } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Loading, TimeAgo } from "@cocalc/frontend/components";
import { SiteLicense } from "@cocalc/frontend/project/settings/site-license";
import { SelectProject } from "@cocalc/frontend/projects/select-project";
import { plural, trunc_middle } from "@cocalc/util/misc";
import { LICENSES_STYLE } from "./managed-licenses";
import { projects_with_licenses } from "./util";

export function ProjectsWithLicenses({}) {
  const [project_id, setProjectId] = useState<string | undefined>(undefined);
  const project_map = useTypedRedux("projects", "project_map");
  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded",
  );
  const projects = useMemo(
    () => projects_with_licenses(project_map),
    [project_map],
  );

  useEffect(() => {
    if (!all_projects_have_been_loaded) {
      // Mounted this component, but all projects aren't loaded, so ensure they get loaded.
      redux.getActions("projects").load_all_projects();
    }
  }, []);

  function sanitize(s: any): string {
    return typeof s === "string" ? s : "";
  }

  function row_renderer({ index }) {
    const { project_id, last_edited, num_licenses } = projects[index];
    const project_title = sanitize(project_map?.getIn([project_id, "title"]));
    return (
      <Row
        key={projects[index]?.project_id}
        style={{ borderBottom: "1px solid lightgrey", cursor: "pointer" }}
        onClick={() => {
          setProjectId(project_id);
        }}
      >
        <Col span={12} style={{ paddingLeft: "15px" }}>
          <a>{trunc_middle(project_title, 80)}</a>
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
        style={{ ...LICENSES_STYLE, height: "175px", marginTop: "5px" }}
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

  return (
    <div>
      <h3>Projects</h3>
      <Alert
        style={{ marginBottom: "15px" }}
        banner
        type="info"
        message={
          <>
            Select a project below to add or remove a license from that project,
            or to buy a license for that project.
          </>
        }
      />
      <SelectProject value={project_id} onChange={setProjectId} />
      {project_id && project_map && (
        <SiteLicense
          project_id={project_id}
          site_license={project_map.getIn([project_id, "site_license"]) as any}
        />
      )}
      <div style={{ marginTop: "10px" }}>
        The following {projects.length} {plural(projects.length, "project")}{" "}
        have a license:
      </div>
      {render_projects_with_license()}
    </div>
  );
}
