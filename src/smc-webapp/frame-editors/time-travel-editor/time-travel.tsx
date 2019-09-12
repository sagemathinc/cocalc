import { List, Map } from "immutable";
import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";

import { Loading } from "../../r_misc";

import { TimeTravelActions } from "./actions";

import { Document } from "./document";
import { Diff } from "./diff";
import { NavigationButtons } from "./navigation-buttons";
import { NavigationSlider } from "./navigation-slider";
import { Version } from "./version";
import { Author } from "./author";
import { LoadFullHistory } from "./load-full-history";
import { OpenFile } from "./open-file";
import { RevertFile } from "./revert-file";
import { OpenSnapshots } from "./open-snapshots";
import { Export } from "./export";

interface Props {
  actions: TimeTravelActions;
  id: string;
  path: string;
  desc: Map<string, any>;

  // reduxProps
  versions: List<Date>;
  loading: boolean;
  has_full_history: boolean;
}

class TimeTravel extends Component<Props> {
  /*
  // TODO:
  public shouldComponentUpdate(next_props): boolean {
    if (this.props.versions != next_props.versions) return true;
    if (this.props.desc != next_props.desc) {
      return true;
    }
    return false;
  }
  */

  public static reduxProps({ name }) {
    return {
      [name]: {
        versions: rtypes.immutable.List,
        loading: rtypes.bool,
        has_full_history: rtypes.bool
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

  private render_author(): Rendered {
    const version = this.get_version();
    if (version == null) return;
    return <Author actions={this.props.actions} version={version} />;
  }

  private render_load_full_history(): Rendered {
    if (this.props.has_full_history) return;
    return (
      <div>
        <LoadFullHistory actions={this.props.actions} />
      </div>
    );
  }

  private render_open_file(): Rendered {
    return (
      <div>
        <OpenFile actions={this.props.actions} />
      </div>
    );
  }

  private render_open_snapshots(): Rendered {
    return (
      <div>
        <OpenSnapshots actions={this.props.actions} />
      </div>
    );
  }

  private render_revert_file(): Rendered {
    return (
      <div>
        <RevertFile actions={this.props.actions} version={this.get_version()} />
      </div>
    );
  }

  private render_export(): Rendered {
    return (
      <div>
        <Export actions={this.props.actions} />
      </div>
    );
  }

  public render(): Rendered {
    if (this.props.loading) {
      return <Loading theme={"medium"} />;
    }
    return (
      <div className="smc-vfill">
        {this.render_navigation_buttons()}
        {this.render_navigation_slider()}
        {this.render_version()}
        {this.render_author()}
        {this.render_load_full_history()}
        {this.render_open_file()}
        {this.render_open_snapshots()}
        {this.render_revert_file()}
        {this.render_export()}
        {this.render_document()}
        {this.render_diff()}
      </div>
    );
  }
}

const tmp = rclass(TimeTravel);
export { tmp as TimeTravel };
