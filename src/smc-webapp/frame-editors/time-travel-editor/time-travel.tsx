import { List, Map } from "immutable";
import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";

import { ButtonGroup } from "react-bootstrap";

import { Loading } from "../../r_misc";

import { TimeTravelActions } from "./actions";

import { Document } from "./document";
import { Diff } from "./diff";
import { NavigationButtons } from "./navigation-buttons";
import { NavigationSlider } from "./navigation-slider";
import { RangeSlider } from "./range-slider";
import { Version, VersionRange } from "./version";
import { Authors } from "./authors";
import { LoadFullHistory } from "./load-full-history";
import { OpenFile } from "./open-file";
import { RevertFile } from "./revert-file";
import { ChangesMode } from "./changes-mode";
import { OpenSnapshots } from "./open-snapshots";
import { Export } from "./export";

interface Props {
  actions: TimeTravelActions;
  id: string;
  path: string;
  project_id: string;
  desc: Map<string, any>;
  font_size: number;

  // reduxProps
  versions?: List<Date>;
  loading?: boolean;
  has_full_history?: boolean;
  docpath?: string;
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
        has_full_history: rtypes.bool,
        docpath: rtypes.string
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
    if (this.props.desc == null || this.props.versions == null) return;
    if (this.props.desc.get("changes_mode")) {
      const version0 = this.props.desc.get("version0");
      const version1 = this.props.desc.get("version1");
      return (
        <VersionRange
          version0={version0}
          version1={version1}
          max={this.props.versions.size}
        />
      );
    } else {
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
  }

  private get_doc(): any {
    const version = this.get_version();
    if (version == null) return;
    return this.props.actions.get_doc(version);
  }

  private render_document(): Rendered {
    const doc = this.get_doc();
    if (
      doc == null ||
      this.props.docpath == null ||
      this.props.desc == null ||
      this.props.desc.get("changes_mode")
    )
      return;
    return (
      <Document
        actions={this.props.actions}
        id={this.props.id}
        doc={doc}
        path={this.props.docpath}
        project_id={this.props.project_id}
        font_size={this.props.font_size}
      />
    );
  }

  private render_diff(): Rendered {
    if (
      this.props.docpath == null ||
      this.props.desc == null ||
      !this.props.desc.get("changes_mode")
    )
      return;
    const version0 = this.props.desc.get("version0");
    const version1 = this.props.desc.get("version1");
    return <Diff doc0={version0} doc1={version1} path={this.props.docpath} />;
  }

  private render_navigation_buttons(): Rendered {
    if (this.props.desc == null || this.props.versions == null) return;
    let version0: number, version1: number;
    if (this.props.desc.get("changes_mode")) {
      version0 = this.props.desc.get("version0");
      version1 = this.props.desc.get("version1");
    } else {
      version0 = version1 = this.props.desc.get("version");
    }
    if (version0 == null || version1 == null) return;
    return (
      <NavigationButtons
        id={this.props.id}
        actions={this.props.actions}
        version0={version0}
        version1={version1}
        max={this.props.versions.size - 1}
      />
    );
  }

  private render_navigation_slider(): Rendered {
    if (
      this.props.desc == null ||
      this.props.versions == null ||
      this.props.desc.get("changes_mode")
    )
      return;
    return (
      <NavigationSlider
        id={this.props.id}
        actions={this.props.actions}
        version={this.props.desc.get("version")}
        max={this.props.versions.size - 1}
      />
    );
  }

  private render_range_slider(): Rendered {
    if (
      this.props.desc == null ||
      this.props.versions == null ||
      !this.props.desc.get("changes_mode")
    )
      return;
    return (
      <RangeSlider
        id={this.props.id}
        actions={this.props.actions}
        max={this.props.versions.size - 1}
        versions={this.props.versions}
        version0={this.props.desc.get("version0")}
        version1={this.props.desc.get("version1")}
      />
    );
  }

  private render_author(): Rendered {
    const version = this.get_version();
    if (version == null) return;
    if (this.props.desc == null) return;
    let version0: number, version1: number;
    if (this.props.desc.get("changes_mode")) {
      version0 = this.props.desc.get("version0");
      version1 = this.props.desc.get("version1");
    } else {
      version0 = version1 = this.props.desc.get("version");
    }
    if (version0 == null || version1 == null) return;
    return (
      <Authors
        actions={this.props.actions}
        version0={version0}
        version1={version1}
      />
    );
  }

  private render_load_full_history(): Rendered {
    if (this.props.has_full_history) return;
    return <LoadFullHistory actions={this.props.actions} />;
  }

  private render_open_file(): Rendered {
    return <OpenFile actions={this.props.actions} />;
  }

  private render_open_snapshots(): Rendered {
    return <OpenSnapshots actions={this.props.actions} />;
  }

  private render_revert_file(): Rendered {
    if (this.props.desc == null || this.props.desc.get("changes_mode")) return;
    return (
      <RevertFile actions={this.props.actions} version={this.get_version()} />
    );
  }

  private render_changes_mode(): Rendered {
    if (this.props.versions == null) return;
    return (
      <ChangesMode
        id={this.props.id}
        actions={this.props.actions}
        disabled={this.props.versions.size <= 1}
        changes_mode={
          this.props.desc != null && this.props.desc.get("changes_mode", false)
        }
      />
    );
  }
  private render_export(): Rendered {
    return <Export actions={this.props.actions} />;
  }

  private render_controls(): Rendered {
    return (
      <div>
        {this.render_changes_mode()}
        {this.render_navigation_buttons()}
        <ButtonGroup style={{ margin: "0 10px" }}>
          {this.render_load_full_history()}
          {this.render_open_file()}
          {this.render_revert_file()}
          {this.render_open_snapshots()}
          {this.render_export()}
        </ButtonGroup>
        {this.render_version()}
        {", "}
        {this.render_author()}
      </div>
    );
  }

  private render_time_select(): Rendered {
    return (
      <>
        {this.render_navigation_slider()}
        {this.render_range_slider()}
      </>
    );
  }

  private render_view(): Rendered {
    return (
      <>
        {this.render_document()}
        {this.render_diff()}
      </>
    );
  }

  public render(): Rendered {
    if (this.props.loading) {
      return <Loading theme={"medium"} />;
    }
    return (
      <div className="smc-vfill">
        {this.render_controls()}
        {this.render_time_select()}
        {this.render_view()}
      </div>
    );
  }
}

const tmp = rclass(TimeTravel);
export { tmp as TimeTravel };
