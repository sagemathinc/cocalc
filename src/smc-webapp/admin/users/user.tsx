/*
Display of basic information about a user, with link to get more information about that user.
*/

const { Icon, Space, TimeAgo } = require("smc-webapp/r_misc");

import {
  React,
  Component,
  Rendered
} from "smc-webapp/frame-editors/generic/react";

import { capitalize } from "smc-webapp/frame-editors/generic/misc";

import { Row, Col } from "react-bootstrap";

import { User } from "smc-webapp/frame-editors/generic/client";

import { Subscriptions } from "./subscriptions";

import { Projects } from "./projects";

import { Activity } from "./activity";

interface State {
  projects: boolean;
  subscriptions: boolean;
  activity: boolean;
}

interface Props extends User {
  header?: boolean;
}

type More = "projects" | "subscriptions" | "activity";

const MORE: More[] = ["projects", "subscriptions", "activity"];

export class UserResult extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    const x: any = {};
    for (let name of MORE) {
      x[name] = false;
    }
    this.state = x as State;
  }

  render_created(): Rendered {
    if (!this.props.created) {
      return <span>unknown</span>;
    }
    return <TimeAgo date={this.props.created} />;
  }

  render_last_active(): Rendered {
    if (!this.props.last_active) {
      return <span>unknown</span>;
    }
    return <TimeAgo date={this.props.last_active} />;
  }

  render_subscriptions(): Rendered {
    if (!this.state.subscriptions) {
      return;
    }
    return <Subscriptions account_id={this.props.account_id} />;
  }

  render_projects(): Rendered {
    if (!this.state.projects) {
      return;
    }
    return <Projects account_id={this.props.account_id} />;
  }

  render_activity(): Rendered {
    if (!this.state.activity) {
      return;
    }
    return <Activity account_id={this.props.account_id} />;
  }

  render_caret(show: boolean): Rendered {
    if (show) {
      return <Icon name="caret-down" />;
    } else {
      return <Icon name="caret-right" />;
    }
  }

  render_more_link(name: More): Rendered {
    // sorry abou the any below; I could NOT get typescript to work.
    return (
      <a
        style={{ cursor: "pointer" }}
        onClick={() => (this as any).setState({ [name]: !this.state[name] })}
      >
        {capitalize(name)} {this.render_caret(this.state[name])}
      </a>
    );
  }

  render_more_links(): Rendered {
    return (
      <div>
        {this.render_more_link("projects")}
        <Space />
        <Space />
        {this.render_more_link("subscriptions")}
        <Space />
        <Space />
        {this.render_more_link("activity")}
      </div>
    );
  }

  render_row(): Rendered {
    return (
      <div>
        <Row style={{ borderTop: "1px solid #ccc" }}>
          <Col md={1}>{this.props.first_name}</Col>
          <Col md={1}>{this.props.last_name}</Col>
          <Col md={2}>{this.props.email_address}</Col>
          <Col md={3}>
            {this.render_last_active()} ({this.render_created()})
          </Col>
          <Col md={3}>{this.render_more_links()}</Col>
        </Row>
        {this.render_subscriptions()}
        {this.render_projects()}
        {this.render_activity()}
      </div>
    );
  }

  render_row_header(): Rendered {
    return (
      <div style={{ color: "#666" }}>
        <Row>
          <Col md={1}>
            <b>{this.props.first_name}</b>
          </Col>
          <Col md={1}>
            <b>{this.props.last_name}</b>
          </Col>
          <Col md={2}>
            <b>{this.props.email_address}</b>
          </Col>
          <Col md={3}>
            <b>
              {this.props.last_active} ({this.props.created}){" "}
              <Icon name="caret-down" />{" "}
            </b>
          </Col>
          <Col md={3}>
            <b>More...</b>
          </Col>
        </Row>
      </div>
    );
  }

  render(): Rendered {
    if (this.props.header) {
      return this.render_row_header();
    } else {
      return this.render_row();
    }
  }
}
