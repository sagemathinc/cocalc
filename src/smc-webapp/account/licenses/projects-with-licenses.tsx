import { Row, Col } from "antd";

import {
  React,
  useMemo,
  useTypedRedux,
  useEffect,
  redux,
} from "../../app-framework";
import { Loading, TimeAgo, WindowedList } from "../../r_misc";
import { projects_with_licenses } from "./util";
import { plural, trunc_middle } from "smc-util/misc2";

function open_project(project_id: string): void {
  redux.getActions("projects").open_project({ project_id });
  redux.getProjectActions(project_id).set_active_tab("settings");
}

export const ProjectsWithLicenses: React.FC = () => {
  const project_map = useTypedRedux("projects", "project_map");
  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded",
  );
  const projects = useMemo(() => projects_with_licenses(project_map), [
    project_map,
  ]);

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
        style={{ borderBottom: "1px solid lightgrey", cursor: "pointer" }}
        onClick={() => {
          open_project(project_id);
        }}
      >
        <Col span={12}>
          {trunc_middle(project_map.getIn([project_id, "title"]), 80)}
        </Col>
        <Col span={6}>
          {num_licenses} {plural(num_licenses, "License")}
        </Col>
        <Col span={6}>{last_edited && <TimeAgo date={last_edited} />}</Col>
      </Row>
    );
  }

  function render_projects_with_license() {
    return (
      <div style={{ height: "50vh" }} className={"smc-vfill"}>
        <WindowedList
          row_count={projects.length}
          row_renderer={row_renderer}
          cache_id={"projects-with-license"}
          overscan_row_count={5}
          estimated_row_size={22}
          row_key={(index) => projects[index]?.project_id}
        />
        {!all_projects_have_been_loaded && <Loading theme={"medium"} />}
      </div>
    );
  }

  return (
    <div>
      {" "}
      <h3>Projects with licenses</h3>
      {render_projects_with_license()}
    </div>
  );
};
