/*
Display of basic information about a user, with link to get more information about that user.
*/

const { Icon, Space, TimeAgo } = require("smc-webapp/r_misc");

import { React, Component, Rendered } from "smc-webapp/app-framework";

import { capitalize } from "smc-util/misc2";

import { Row, Col } from "react-bootstrap";

import { User } from "smc-webapp/frame-editors/generic/client";

import { Subscriptions } from "./subscriptions";

import { Projects } from "./projects";

import { Activity } from "./activity";

import { Impersonate } from "./impersonate";

interface State {
  projects: boolean;
  subscriptions: boolean;
  activity: boolean;
  impersonate: boolean;
}

interface Props extends User {
  header?: boolean;
}

type More = "projects" | "subscriptions" | "activity" | "impersonate";

const MORE: More[] = ["projects", "subscriptions", "activity", "impersonate"];

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

  render_impersonate(): Rendered {
    if (!this.state.impersonate) {
      return;
    }
    return <Impersonate account_id={this.props.account_id} first_name={this.props.first_name} last_name={this.props.last_name}/>;
  }

  render_caret(show: boolean): Rendered {
    if (show) {
      return <Icon name="caret-down" />;
    } else {
      return <Icon name="caret-right" />;
    }
  }

  render_more_link(name: More): Rendered {
    // sorry about the any below; I could NOT get typescript to work.
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
        <Space />
        <Space />
        {this.render_more_link("impersonate")}
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
          <Col md={2}>
            <span
              style={{
                fontSize: "9px",
                overflowX: "scroll",
                whiteSpace: "nowrap"
              }}
            >
              {this.props.account_id}
            </span>
          </Col>
        </Row>
        {this.render_subscriptions()}
        {this.render_projects()}
        {this.render_activity()}
        {this.render_impersonate()}
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
          <Col md={2}>
            <b>{this.props.account_id}</b>
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
