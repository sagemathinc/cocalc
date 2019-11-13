/*
The tag editing toolbar functionality for cells.
*/

import { Button, FormControl } from "react-bootstrap";
import { React, Component } from "../app-framework";
import { Map as ImmutableMap } from "immutable";
const { Icon } = require("../r_misc");
const misc = require("smc-util/misc");
import { JupyterActions } from "./browser-actions";

const TAG_STYLE: React.CSSProperties = {
  padding: "3px 5px",
  margin: "3px 3px",
  background: "#5bc0de",
  borderRadius: "3px",
  color: "white",
  display: "inline-block"
};

interface TagsToolbarProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

interface TagsToolbarState {
  input: string;
}

export class TagsToolbar extends Component<TagsToolbarProps, TagsToolbarState> {
  constructor(props: TagsToolbarProps, context: any) {
    super(props, context);
    this.state = { input: "" };
  }

  remove_tag = (tag: string) => {
    this.props.actions.remove_tag(this.props.cell.get("id"), tag);
  };

  render_tag = (tag: string) => {
    return (
      <span key={tag} style={TAG_STYLE}>
        {tag}
        <Icon
          name="times"
          style={{ marginLeft: "5px", cursor: "pointer" }}
          onClick={() => this.remove_tag(tag)}
        />
      </span>
    );
  };

  render_tags() {
    const tags = this.props.cell.get("tags");
    if (tags == null) {
      return;
    }
    // TODO: skip toJS call and just use immutable functions?
    return (
      <div style={{ flex: 1 }}>
        {misc
          .keys(tags.toJS())
          .sort()
          .map(tag => this.render_tag(tag))}
      </div>
    );
  }

  render_tag_input() {
    return (
      <FormControl
        onFocus={this.props.actions.blur_lock}
        onBlur={this.props.actions.focus_unlock}
        type="text"
        value={this.state.input}
        onChange={(e: any) => this.setState({ input: e.target.value })}
        style={{ height: "34px" }}
        bsSize={"small"}
        onKeyDown={e => {
          if (e.which === 13) {
            this.add_tags();
            return;
          }
        }}
      />
    );
  }

  add_tags = () => {
    for (const tag of misc.split(this.state.input)) {
      this.props.actions.add_tag(this.props.cell.get("id"), tag, false);
    }
    this.props.actions._sync();
    this.setState({ input: "" });
  };

  render_add_button = () => {
    return (
      <Button
        bsSize="small"
        disabled={this.state.input.length === 0}
        title="Add tag or tags (separate by spaces)"
        onClick={this.add_tags}
        style={{ height: "34px" }}
      >
        Add
      </Button>
    );
  };

  render_input() {
    return (
      <div style={{ display: "flex" }}>
        {this.render_tag_input()}
        {this.render_add_button()}
      </div>
    );
  }

  render() {
    return (
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", float: "right" }}>
          {this.render_tags()}
          {this.render_input()}
        </div>
      </div>
    );
  }
}
