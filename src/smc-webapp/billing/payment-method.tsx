import { Component, React, Rendered } from "../app-framework";
import { Alert, Button, ButtonToolbar, Row, Col } from "react-bootstrap";
import { Icon } from "../r_misc/icon";
import { Space } from "../r_misc/space";
import { brand_to_icon_name } from "./data";

import { Source } from "./types";

interface Props {
  source: Source;
  default?: boolean; // required for set_as_default
  set_as_default?: Function; // called when this card should be set to default
  delete_method?: Function; // called when this card should be deleted
}

interface State {
  confirm_default: boolean;
  confirm_delete: boolean;
}

export class PaymentMethod extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      confirm_default: false,
      confirm_delete: false
    };
  }

  private icon_name(): string {
    return brand_to_icon_name(this.props.source.brand.toLowerCase());
  }

  private render_confirm_default(): Rendered {
    return (
      <Alert bsStyle="warning">
        <Row>
          <Col md={5} mdOffset={2}>
            <p>
              Are you sure you want to set this payment card to be the default?
            </p>
            <p>
              All future payments will be made with the card that is the default{" "}
              <b>at the time of renewal</b>. Changing your default card right
              before a subscription renewal will cause the <Space />
              new default to be charged instead of the previous one.
            </p>
          </Col>
          <Col md={5}>
            <ButtonToolbar>
              <Button
                onClick={() => {
                  this.setState({ confirm_default: false });
                  if (this.props.set_as_default != null)
                    this.props.set_as_default();
                }}
                bsStyle="warning"
              >
                <Icon name="trash" /> Set to Default
              </Button>
              <Button onClick={() => this.setState({ confirm_default: false })}>
                Cancel
              </Button>
            </ButtonToolbar>
          </Col>
        </Row>
      </Alert>
    );
  }

  private render_confirm_delete(): Rendered {
    return (
      <Alert bsStyle="danger">
        <Row>
          <Col md={5} mdOffset={2}>
            Are you sure you want to delete this payment method?
          </Col>
          <Col md={5}>
            <ButtonToolbar>
              <Button
                bsStyle="danger"
                onClick={() => {
                  this.setState({ confirm_delete: false });
                  if (this.props.delete_method != null)
                    this.props.delete_method();
                }}
              >
                <Icon name="trash" /> Delete Payment Method
              </Button>
              <Button onClick={() => this.setState({ confirm_delete: false })}>
                Cancel
              </Button>
            </ButtonToolbar>
          </Col>
        </Row>
      </Alert>
    );
  }

  private render_card(): Rendered {
    return (
      <Row>
        <Col md={2}>
          <Icon name={this.icon_name()} /> {this.props.source.brand}
        </Col>
        <Col md={1}>
          <em>····</em>
          {this.props.source.last4}
        </Col>
        <Col md={1}>
          {this.props.source.exp_month}/{this.props.source.exp_year}
        </Col>
        <Col md={2}>{this.props.source.name}</Col>
        <Col md={1}>{this.props.source.country}</Col>
        <Col md={2}>
          {this.props.source.address_state}
          <Space />
          <Space />
          {this.props.source.address_zip}
        </Col>
        {this.props.set_as_default != null || this.props.delete_method != null
          ? this.render_action_buttons()
          : undefined}
      </Row>
    );
  }

  private render_action_buttons(): Rendered {
    return (
      <Col md={3}>
        <ButtonToolbar style={{ float: "right" }}>
          {this.props.set_as_default != null ? (
            <Button
              onClick={() => this.setState({ confirm_default: true })}
              disabled={this.props.default}
              bsStyle={this.props.default ? "primary" : "default"}
            >
              Default{!this.props.default ? <span>... </span> : undefined}
            </Button>
          ) : (
            undefined
          )}

          {this.props.delete_method != null ? (
            <Button onClick={() => this.setState({ confirm_delete: true })}>
              <Icon name="trash" /> Delete
            </Button>
          ) : (
            undefined
          )}
        </ButtonToolbar>
      </Col>
    );
  }

  public render(): Rendered {
    return (
      <div
        style={{
          borderBottom: "1px solid #999",
          paddingTop: "5px",
          paddingBottom: "5px"
        }}
      >
        {this.render_card()}
        {this.state.confirm_default ? this.render_confirm_default() : undefined}
        {this.state.confirm_delete ? this.render_confirm_delete() : undefined}
      </div>
    );
  }
}
