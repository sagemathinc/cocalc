/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { Loading } from "../../r_misc";
import { redux, rclass, rtypes, Component, React } from "../../app-framework";

interface reduxProps {
  project_map?: Map<string, any>;
  all_projects_have_been_loaded?: boolean;
}

interface InfoAboutLicense {
  upgraded_project_ids: string[]; // projects that you are a collab on that this license is applied to and it is actively upgrading it.
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
            x[id] = { upgraded_project_ids: [project_id] };
          } else {
            x[id].upgraded_project_ids.push(project_id);
          }
        }
      }
    }
  }
  return x;
}

class LicensesPage extends Component<reduxProps> {
  static reduxProps() {
    return {
      projects: {
        project_map: rtypes.immutable.Map,
        all_projects_have_been_loaded: rtypes.bool,
      },
    };
  }

  public render(): JSX.Element {
    if (this.props.project_map == null) {
      return <Loading theme={"medium"} />;
    }
    if (!this.props.all_projects_have_been_loaded) {
      redux.getActions("projects").load_all_projects();
      return <Loading theme={"medium"} />;
    }

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
}

const tmp = rclass(LicensesPage);
export { tmp as LicensesPage };
