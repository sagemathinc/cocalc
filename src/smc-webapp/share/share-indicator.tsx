/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Indicator about whether or not file or path is publicly shared.
*/

import { Map } from "immutable";

import { containing_public_path } from "smc-util/misc";

import {
  React,
  rclass,
  rtypes,
  COLOR,
  Component,
  Rendered,
  redux,
} from "../app-framework";

import { Icon, Loading } from "../r_misc";

const SHARE_INDICATOR_STYLE = {
  fontSize: "14pt",
  borderRadius: "3px",
  marginTop: "3px",
  display: "flex",
  top: "-30px",
  right: "3px",
};

interface Props {
  project_id: string;
  path: string;
  shrink_fixed_tabs: boolean;
  public_paths: Map<string, any>;
}

class ShareIndicator extends Component<Props> {
  static reduxProps({ name }) {
    return {
      [name]: {
        public_paths: rtypes.immutable,
      },
    };
  }

  private render_label(is_public: boolean): Rendered {
    let label;
    if (this.props.shrink_fixed_tabs) {
      return;
    }
    if (is_public) {
      label = "Public";
    } else {
      label = "Private";
    }
    return (
      <span style={{ fontSize: "10.5pt", marginLeft: "5px" }}>{label}</span>
    );
  }

  private show_share_control(): void {
    redux.getProjectActions(this.props.project_id).show_file_action_panel({
      path: this.props.path,
      action: "share",
    });
  }

  private render_share_button(is_public: boolean): Rendered {
    let icon;
    if (is_public) {
      icon = "bullhorn";
    } else {
      icon = "lock";
    }
    return (
      <div
        style={{
          cursor: "pointer",
          color: COLOR.FG_BLUE,
          marginLeft: "5px",
          marginRight: "5px",
        }}
      >
        <span onClick={this.show_share_control.bind(this)}>
          <Icon name={icon} />
          {this.render_label(is_public)}
        </span>
      </div>
    );
  }

  private is_public(): boolean {
    const paths: string[] = [];
    this.props.public_paths.forEach(function (info) {
      if (!info.get("disabled")) {
        paths.push(info.get("path"));
      }
    });
    const x = containing_public_path(this.props.path, paths);
    return x != null;
  }

  public render(): Rendered {
    if (this.props.public_paths == null) {
      return <Loading />;
    }
    const is_public = this.is_public();
    return (
      <div style={SHARE_INDICATOR_STYLE}>
        {this.render_share_button(is_public)}
      </div>
    );
  }
}

const tmp = rclass(ShareIndicator);
export { tmp as ShareIndicator };
