import * as React from "react";
import memoizeOne from "memoize-one";

import { ProjectActions } from "../../project_actions";

import { CopyButton } from "./copy-button";
import { PublicButton } from "./public-button";
import { FileCheckbox } from "./file-checkbox";
import { generate_click_for } from "./utils";

const { COLORS, TimeAgo, Tip, Icon } = require("../../r_misc");

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
  style: React.CSSProperties;
}

interface State {
  selection_at_last_mouse_down: string;
}

function compute_row_style(bordered, color): React.CSSProperties {
  return {
    cursor: "pointer",
    borderRadius: "4px",
    backgroundColor: color,
    borderStyle: "solid",
    borderColor: bordered ? COLORS.BLUE_BG : color
  };
}

const directory_style: React.CSSProperties = {
  fontWeight: "bold",
  whiteSpace: "pre-wrap",
  wordWrap: "break-word",
  overflowWrap: "break-word",
  verticalAlign: "sub"
};

function compute_link_style(mask): React.CSSProperties {
  return { color: mask ? "#bbbbbb" : undefined };
}

export class DirectoryRow extends React.Component<Props, State> {
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

  handle_mouse_down = () => {
    this.setState({
      selection_at_last_mouse_down: window.getSelection().toString()
    });
  };

  handle_click = () => {
    if (this.state == undefined) {
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
  };

  row_style = memoizeOne(compute_row_style);
  link_style = memoizeOne(compute_link_style);

  generate_on_copy_click = memoizeOne((full_path: string) => {
    return generate_click_for("copy", full_path, this.props.actions);
  });

  generate_on_share_click = memoizeOne((full_path: string) => {
    return generate_click_for("share", full_path, this.props.actions);
  });

  render_public_directory_info() {
    if (this.props.public_view) {
      return (
        <CopyButton on_click={this.generate_on_copy_click(this.full_path())} />
      );
    } else if (this.props.is_public) {
      return (
        <PublicButton
          on_click={this.generate_on_share_click(this.full_path())}
        />
      );
    }
  }

  full_path() {
    return misc.path_to_file(this.props.current_path, this.props.name);
  }

  render_time() {
    if (this.props.time != undefined) {
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
    const link_style = this.link_style(this.props.mask);

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
          <a style={link_style}>
            {misc.trunc_middle(
              this.props.display_name != undefined
                ? this.props.display_name
                : this.props.name,
              50
            )}
          </a>
        </Tip>
      );
    } else {
      return (
        <a style={link_style}>
          {misc.trunc_middle(
            this.props.display_name != undefined
              ? this.props.display_name
              : this.props.name,
            50
          )}
        </a>
      );
    }
  }

  render() {
    const row_style = Object.assign(
      {},
      this.props.style,
      this.row_style(this.props.bordered, this.props.color)
    );
    const link_style = this.link_style(this.props.mask);

    return (
      <Row
        style={row_style}
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
          <a style={link_style}>
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
          <Size size={this.props.size} />
        </Col>
        <Col sm={5} smPull={4} xs={12} style={directory_style}>
          {this.render_name_link()}
        </Col>
      </Row>
    );
  }
}

const size_style = { color: "#666", marginRight: "3em" };

function Size({ size }) {
  if (size == undefined) {
    return null;
  }

  return (
    <span className="pull-right" style={size_style}>
      {size} {misc.plural(size, "item")}
    </span>
  );
}
