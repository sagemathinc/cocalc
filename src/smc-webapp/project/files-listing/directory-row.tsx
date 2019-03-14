/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as React from "react";

import { ProjectActions } from "../../project_actions";

import { CopyButton } from "./copy-button";
import { PublicButton } from "./public-button";
import { generate_click_for } from "./utils";

const { COLORS, TimeAgo, Tip, FileCheckbox, Icon } = require("../../r_misc");

const { Row, Col } = require("react-bootstrap");
const misc = require("smc-util/misc");

interface Props {
  name: string;
  display_name: string; // if given, will display this, and will show true filename in popover
  checked: boolean;
  color: string;
  bordered: boolean;
  time: number;
  size: number;
  issymlink: boolean;
  mask: boolean;
  public_data: object;
  is_public: boolean;
  current_path: string;
  actions: ProjectActions;
  no_select: boolean;
  public_view: boolean;
}

interface State {
  selection_at_last_mouse_down: string;
}

export class DirectoryRow extends React.PureComponent<Props, State> {
  shouldComponentUpdate(next) {
    return (
      this.props.name !== next.name ||
      this.props.display_name !== next.display_name ||
      this.props.checked !== next.checked ||
      this.props.color !== next.color ||
      this.props.bordered !== next.bordered ||
      this.props.time !== next.time ||
      this.props.mask !== next.mask ||
      this.props.public_data !== next.public_data ||
      this.props.is_public !== next.is_public ||
      this.props.current_path !== next.current_path ||
      this.props.no_select !== next.no_select ||
      this.props.public_view !== next.public_view ||
      this.props.issymlink !== next.issymlink
    );
  }

  handle_mouse_down() {
    this.setState({
      selection_at_last_mouse_down: window.getSelection().toString()
    });
  }

  handle_click() {
    if (this.state == null) {
      // see https://github.com/sagemathinc/cocalc/issues/3442
      return;
    }
    if (
      window.getSelection().toString() ===
      this.state.selection_at_last_mouse_down
    ) {
      this.props.actions.open_directory(this.full_path());
      this.props.actions.set_file_search("");
    }
  }

  render_public_directory_info() {
    if (this.props.public_view) {
      return (
        <CopyButton
          on_click={generate_click_for(
            "copy",
            this.full_path(),
            this.props.actions
          )}
        />
      );
    } else if (this.props.is_public) {
      return (
        <PublicButton
          on_click={generate_click_for(
            "share",
            this.full_path(),
            this.props.actions
          )}
        />
      );
    }
  }

  full_path() {
    return misc.path_to_file(this.props.current_path, this.props.name);
  }

  render_time() {
    if (this.props.time != null) {
      try {
        return (
          <TimeAgo
            date={new Date(this.props.time * 1000).toISOString()}
            style={{ color: "#666" }}
          />
        );
      } catch (error) {
        return (
          <div style={{ color: "#666", display: "inline" }}>
            Invalid Date Time
          </div>
        );
      }
    }
  }

  render_name_link() {
    if (
      (this.props.display_name &&
        this.props.display_name !== this.props.name) ||
      this.props.name.length > 50
    ) {
      return (
        <Tip
          title={
            this.props.display_name
              ? "Displayed directory name is an alias. The actual name is:"
              : "Full name"
          }
          tip={this.props.name}
        >
          <a style={{ color: this.props.mask ? "#bbbbbb" : undefined }}>
            {misc.trunc_middle(
              this.props.display_name != null
                ? this.props.display_name
                : this.props.name,
              50
            )}
          </a>
        </Tip>
      );
    } else {
      return (
        <a style={{ color: this.props.mask ? "#bbbbbb" : undefined }}>
          {misc.trunc_middle(
            this.props.display_name != null
              ? this.props.display_name
              : this.props.name,
            50
          )}
        </a>
      );
    }
  }

  render_size() {
    if (this.props.size == null) {
      // need newer backend project
      return;
    }
    return (
      <span
        className="pull-right"
        style={{ color: "#666", marginRight: "3em" }}
      >
        {this.props.size} {misc.plural(this.props.size, "item")}
      </span>
    );
  }

  render() {
    const row_styles = {
      cursor: "pointer",
      borderRadius: "4px",
      backgroundColor: this.props.color,
      borderStyle: "solid",
      borderColor: this.props.bordered ? COLORS.BLUE_BG : this.props.color
    };

    const directory_styles = {
      fontWeight: "bold",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      overflowWrap: "break-word",
      verticalAlign: "sub"
    };

    return (
      <Row
        style={row_styles}
        onMouseDown={this.handle_mouse_down}
        onClick={this.handle_click}
        className={this.props.no_select ? "noselect" : undefined}
      >
        <Col sm={2} xs={3}>
          <FileCheckbox
            name={this.props.name}
            checked={this.props.checked}
            current_path={this.props.current_path}
            actions={this.props.actions}
            style={{ verticalAlign: "sub" }}
          />
          {this.render_public_directory_info()}
        </Col>
        <Col sm={1} xs={3}>
          <a style={{ color: this.props.mask ? "#bbbbbb" : undefined }}>
            <Icon
              name="folder-open-o"
              style={{ fontSize: "14pt", verticalAlign: "sub" }}
            />
            <Icon
              name="caret-right"
              style={{
                marginLeft: "3px",
                fontSize: "14pt",
                verticalAlign: "sub"
              }}
            />
          </a>
        </Col>
        <Col sm={4} smPush={5} xs={6}>
          {this.render_time()}
          {this.render_size()}
        </Col>
        <Col sm={5} smPull={4} xs={12} style={directory_styles}>
          {this.render_name_link()}
        </Col>
      </Row>
    );
  }
}
