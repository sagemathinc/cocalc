import { React, useRedux, useEffect, redux } from "../../app-framework";
import { Loading } from "../../r_misc";
import { Map } from "immutable";
import { applied_licenses_info } from "./util";

export const AppliedLicenses: React.FC<> = () => {
  const project_map: Map<string, any> = useRedux(["projects", "project_map"]);
  const all_projects_have_been_loaded = useRedux([
    "projects",
    "all_projects_have_been_loaded",
  ]);

  useEffect(() => {
    if (!all_projects_have_been_loaded) {
      // Mounted this component, but all projects aren't loaded, so ensure they get loaded.
      redux.getActions("projects").load_all_projects();
    }
  }, []);

  function render_applied() {
    if (!project_map || !all_projects_have_been_loaded) {
      return <Loading theme={"medium"} />;
    } else {
      return (
        <pre>
          {JSON.stringify(applied_licenses_info(project_map), undefined, 2)}
        </pre>
      );
    }
  }

  return (
    <div>
      {" "}
      <h3>Projects upgraded using licenses</h3>
      {render_applied()}
    </div>
  );
};
