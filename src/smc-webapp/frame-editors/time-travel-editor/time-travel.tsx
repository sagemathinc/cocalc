import { List, Map } from "immutable";
import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";

import { TimeTravelActions } from "./actions";
import { Document } from "./document";
import { Diff } from "./diff";
import { NavigationButtons } from "./navigation-buttons";
import { NavigationSlider } from "./navigation-slider";
import { Version } from "./version";

interface Props {
  actions: TimeTravelActions;
  id: string;
  path: string;
  desc: Map<string, any>;
  // reduxProps
  versions: List<Date>;
}

class TimeTravel extends Component<Props> {
  public shouldComponentUpdate(next_props): boolean {
    if (this.props.versions != next_props.versions) return true;
    if (this.props.desc != next_props.desc) {
      return true;
    }
    return false;
  }

  public static reduxProps({ name }) {
    return {
      [name]: {
        versions: rtypes.immutable.List
      }
    };
  }

  private get_version(): Date | undefined {
    if (this.props.desc == null || this.props.versions == null) return;
    const version = this.props.desc.get("version");
    const d: Date | undefined = this.props.versions.get(version);
    if (d != null) return d;
    return this.props.versions.get(-1);
  }

  private render_version(): Rendered {
    const date = this.get_version();
    const version = this.props.desc.get("version");
    if (date == null || version == null) return;
    return (
      <Version
        date={date}
        number={version + 1}
        max={this.props.versions.size}
      />
    );
  }

  private get_doc(): any {
    const version = this.get_version();
    if (version == null) return;
    return this.props.actions.get_doc(version);
  }

  private render_document(): Rendered {
    const doc = this.get_doc();
    if (doc == null) return;
    return <Document doc={doc} path={this.props.path} />;
  }

  private render_diff(): Rendered {
    return <Diff doc1={0} doc2={1} path={this.props.path} />;
  }

  private render_navigation_buttons(): Rendered {
    if (this.props.desc == null || this.props.versions == null) return;
    return (
      <NavigationButtons
        id={this.props.id}
        actions={this.props.actions}
        version={this.props.desc.get("version")}
        max={this.props.versions.size - 1}
      />
    );
  }

  private render_navigation_slider(): Rendered {
    if (this.props.desc == null || this.props.versions == null) return;
    return (
      <NavigationSlider
        id={this.props.id}
        actions={this.props.actions}
        version={this.props.desc.get("version")}
        max={this.props.versions.size - 1}
      />
    );
  }

  public render(): Rendered {
    return (
      <div className="smc-vfill">
        {this.render_navigation_buttons()}
        {this.render_navigation_slider()}
        {this.render_version()}
        {this.render_document()}
        {this.render_diff()}
      </div>
    );
  }
}

const tmp = rclass(TimeTravel);
export { tmp as TimeTravel };
