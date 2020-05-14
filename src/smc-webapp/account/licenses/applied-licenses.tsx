import {
  redux,
  rclass,
  rtypes,
  Component,
  React,
  Rendered,
} from "../../app-framework";

import { Loading } from "../../r_misc";

import { Map } from "immutable";

interface InfoAboutLicense {
  upgraded_project_ids: string[]; // projects that you are a collab on that this license is applied to and it is actively upgrading it.
  applied_project_ids: string[]; // projects you are a collab on that this license is applied to but not actively upgrading
}

function applied_licenses_info(
  project_map: Map<string, any>
): { [id: string]: InfoAboutLicense } {
  const x: { [id: string]: InfoAboutLicense } = {};
  for (const y of project_map) {
    const [project_id, project] = y;
    const v = project.get("site_license");
    if (v != null) {
      for (const z of v) {
        const [id, upgrade] = z;
        if (
          upgrade.size > 0 &&
          project.getIn(["state", "state"]) == "running"
        ) {
          if (x[id] == null) {
            x[id] = {
              upgraded_project_ids: [project_id],
              applied_project_ids: [],
            };
          } else {
            x[id].upgraded_project_ids.push(project_id);
          }
        } else {
          if (x[id] == null) {
            x[id] = {
              applied_project_ids: [project_id],
              upgraded_project_ids: [],
            };
          } else {
            x[id].applied_project_ids.push(project_id);
          }
        }
      }
    }
  }
  return x;
}

interface reduxProps {
  project_map?: Map<string, any>;
  all_projects_have_been_loaded?: boolean;
}

class AppliedLicenses extends Component<reduxProps> {
  static reduxProps() {
    return {
      projects: {
        project_map: rtypes.immutable.Map,
        all_projects_have_been_loaded: rtypes.bool,
      },
    };
  }

  private render_applied(): Rendered {
    if (!this.props.project_map) return <Loading theme={"medium"} />;
    return (
      <pre>
        {JSON.stringify(
          applied_licenses_info(this.props.project_map),
          undefined,
          2
        )}
      </pre>
    );
  }

  public render(): JSX.Element {
    if (!this.props.all_projects_have_been_loaded) {
      redux.getActions("projects").load_all_projects();
      return <Loading theme={"medium"} />;
    }

    return (
      <div>
        {" "}
        <h3>Projects upgraded using licenses</h3>
        {this.render_applied()}
      </div>
    );
  }
}

const tmp = rclass(AppliedLicenses);
export { tmp as AppliedLicenses };
