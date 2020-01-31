import { Set } from "immutable";
import { Component, React, Rendered } from "../../app-framework";

interface Props {
  projects_using_license: Set<string>;
}

export class ProjectsUsingLicense extends Component<Props> {
  public render(): Rendered {
    return (
      <span>
        ProjectsUsing License:{" "}
        {JSON.stringify(this.props.projects_using_license.toJS())}
      </span>
    );
  }
}
