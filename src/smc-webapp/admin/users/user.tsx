/*
Display of basic information about a user, with link to get more information about that user.
*/

const { TimeAgo } = require("smc-webapp/r_misc");

import {
  React,
  Component,
  Rendered
} from "smc-webapp/frame-editors/generic/react";

import { Row, Col } from "react-bootstrap";

import { User } from "smc-webapp/frame-editors/generic/client";

export class UserResult extends Component<User, {}> {
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

  render(): Rendered {
    return (
      <Row style={{borderTop: '1px solid #ccc'}}>
        <Col md={2}>{this.props.first_name}</Col>
        <Col md={2}>{this.props.last_name}</Col>
        <Col md={3}>{this.props.email_address}</Col>
        <Col md={2}>Created: {this.render_created()}</Col>
        <Col md={3}>Last active: {this.render_last_active()})</Col>
      </Row>
    );
  }
}
