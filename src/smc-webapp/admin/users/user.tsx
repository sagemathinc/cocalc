/*
Display of basic information about a user, with link to get more information about that user.
*/

const { Icon, TimeAgo } = require("smc-webapp/r_misc");

import {
  React,
  Component,
  Rendered
} from "smc-webapp/frame-editors/generic/react";

import { Row, Col } from "react-bootstrap";

import { User } from "smc-webapp/frame-editors/generic/client";

import { Subscriptions } from "./subscriptions";

import { Projects } from "./projects";

interface State {
  show_projects: boolean;
  show_subscriptions: boolean;
}

interface Props extends User {
  header?: boolean;
}

export class UserResult extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { show_projects: false, show_subscriptions: false };
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
    if (!this.state.show_subscriptions) {
      return;
    }
    return <Subscriptions account_id={this.props.account_id} />;
  }

  render_projects(): Rendered {
    if (!this.state.show_projects) {
      return;
    }
    return <Projects account_id={this.props.account_id} />;
  }

  render_caret(show: boolean): Rendered {
    if (show) {
      return <Icon name="caret-down" />;
    } else {
      return <Icon name="caret-right" />;
    }
  }

  render_row(): Rendered {
    return (
      <div>
        <Row style={{ borderTop: "1px solid #ccc" }}>
          <Col md={1}>{this.props.first_name}</Col>
          <Col md={1}>{this.props.last_name}</Col>
          <Col md={2}>{this.props.email_address}</Col>
          <Col md={2}>{this.render_created()}</Col>
          <Col md={2}>{this.render_last_active()}</Col>
          <Col md={2}>
            <a
              onClick={() =>
                this.setState({ show_projects: !this.state.show_projects })
              }
            >
              {this.render_caret(this.state.show_projects)} Projects
            </a>{" "}
          </Col>
          <Col md={2}>
            <a
              onClick={() =>
                this.setState({
                  show_subscriptions: !this.state.show_subscriptions
                })
              }
            >
              {this.render_caret(this.state.show_subscriptions)} Subscriptions
            </a>
          </Col>
        </Row>
        {this.render_subscriptions()}
        {this.render_projects()}
      </div>
    );
  }

  render_row_header(): Rendered {
    return (
      <div>
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
          <Col md={2}>
            <b>{this.props.created}</b>
          </Col>
          <Col md={2}>
            <b>{this.props.last_active}</b>
          </Col>
          <Col md={2}>
            <b>Projects</b>
          </Col>
          <Col md={2}>
            <b>Subscriptions</b>
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
