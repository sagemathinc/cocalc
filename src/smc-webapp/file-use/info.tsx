import { Component, React, Rendered } from "../app-framework";

import { analytics_event } from "../tracker";

const { User } = require("../users");
const { TimeAgo } = require("../r_misc");
import { r_join } from "../r_misc/r_join";
import { Icon } from "../r_misc/icon";

import { FileUseIcon } from "./icon";

import { Map as iMap } from "immutable";

const { Col, Grid, Row } = require("react-bootstrap");

const misc = require("smc-util/misc");

import { open_file_use_entry } from "./util";

const { get_user_name } = require("../editor_chat");

// Arbitrary constants:

// Maximum number of distinct user names to show in a notification
const MAX_USERS = 5;
// Length to truncate project title and filename to.
const TRUNCATE_LENGTH = 50;

const file_use_style = {
  border: "1px solid #aaa",
  cursor: "pointer",
  width: "100%"
};

interface Props {
  info: iMap<string, any>;
  account_id: string;
  user_map: iMap<string, any>;
  project_map: iMap<string, any>;
  redux: any;
  cursor?: boolean;
  mask?: string; // TODO: not used in client code.  Why?? remove... or?
}

export class FileUseInfo extends Component<Props, {}> {
  shouldComponentUpdate(props: Props): boolean {
    return misc.is_different(this.props, props, [
      "info",
      "cursor",
      "user_map",
      "project_map"
    ]);
  }

  render_users(): Rendered[] | undefined {
    if (this.props.info.get("users") == null) return;
    const v: Rendered[] = [];
    // only list users who have actually done something aside from mark read/seen this file
    const users: any[] = [];
    this.props.info.get("users").forEach((user, _) => {
      if (user != null && user.get("last_edited")) {
        users.push(user.toJS());
      }
    });
    for (let user of users.slice(0, MAX_USERS)) {
      v.push(
        <User
          key={user.account_id}
          account_id={user.account_id}
          name={user.account_id === this.props.account_id ? "You" : undefined}
          user_map={this.props.user_map}
          last_active={user.last_edited}
        />
      );
    }
    return r_join(v);
  }

  render_last_edited(): Rendered {
    if (this.props.info.get("last_edited")) {
      return (
        <span key="last_edited">
          was edited <TimeAgo date={this.props.info.get("last_edited")} />
        </span>
      );
    }
  }

  open(e): void {
    if (e != null) {
      e.preventDefault();
    }
    const x = this.props.info;
    open_file_use_entry(
      x.get("project_id"),
      x.get("path"),
      x.get("show_chat", false),
      this.props.redux,
      { course_discussion: x.get("course_discussion") }
    );
    analytics_event(
      "file_notifications",
      "open from click",
      misc.filename_extension(x.get("path"))
    );
  }

  render_path(): Rendered {
    let { name, ext } = misc.separate_file_extension(
      this.props.info.get("path")
    );
    name = misc.trunc_middle(name, TRUNCATE_LENGTH);
    ext = misc.trunc_middle(ext, TRUNCATE_LENGTH);
    return (
      <span>
        <span
          style={{
            fontWeight: this.props.info.get("is_unread") ? "bold" : "normal"
          }}
        >
          {name}
        </span>
        <span style={{ color: !this.props.mask ? "#999" : undefined }}>
          {ext === "" ? "" : `.${ext}`}
        </span>
      </span>
    );
  }

  render_project(): Rendered {
    const proj = this.props.project_map.get(this.props.info.get("project_id"));
    const title = proj == null ? "" : proj.get("title");
    return <em key="project">{misc.trunc(title, TRUNCATE_LENGTH)}</em>;
  }

  render_what_is_happening(): Rendered {
    if (this.props.info.get("users") == null) {
      return this.render_last_edited();
    }
    if (this.props.info.get("course_discussion")) {
      // assignment_path and student's account_id
      const [assignment, account_id] = this.props.info.get("course_discussion");
      const student = get_user_name(account_id, this.props.user_map);
      if (student && student != "Unknown") {
        return (
          <span>
            discussion about "{student}" in "{assignment}" by{" "}
          </span>
        );
      } else {
        return <span>discussion in "{assignment}" by </span>;
      }
    }
    if (this.props.info.get("show_chat")) {
      return <span>discussed by </span>;
    }
    return <span>edited by </span>;
  }

  render_action_icon(): Rendered {
    if (this.props.info.get("show_chat")) {
      return <Icon name="comment" />;
    } else {
      return <Icon name="edit" />;
    }
  }

  render_type_icon(): Rendered {
    return <FileUseIcon filename={this.props.info.get("path")} />;
  }

  render(): Rendered {
    const style = misc.copy(file_use_style);
    if (this.props.info.get("notify")) {
      style.background = "#ffffea"; // very light yellow
    } else {
      style.background = this.props.info.get("is_unread")
        ? "#f4f4f4"
        : "#fefefe";
    }
    if (this.props.cursor) {
      misc.merge(style, { background: "#08c", color: "white" });
    }
    return (
      <Grid style={style} onClick={e => this.open(e)} fluid={true}>
        <Row style={{ padding: "5px" }}>
          <Col key="action" sm={1} style={{ fontSize: "14pt" }}>
            {this.render_action_icon()}
          </Col>
          <Col key="desc" sm={10}>
            {this.render_path()} in {this.render_project()}{" "}
            {this.render_what_is_happening()} {this.render_users()}
          </Col>
          <Col key="type" sm={1} style={{ fontSize: "14pt" }}>
            {this.render_type_icon()}
          </Col>
        </Row>
      </Grid>
    );
  }
}
