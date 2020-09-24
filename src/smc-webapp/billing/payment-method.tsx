/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered, useState } from "../app-framework";
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

export const PaymentMethod: React.FC<Props> = (props) => {
  const [confirm_default, set_confirm_default] = useState<boolean>(false);
  const [confirm_delete, set_confirm_delete] = useState<boolean>(false);

  function icon_name(): string {
    return brand_to_icon_name(
      props.source.brand != null ? props.source.brand.toLowerCase() : undefined
    );
  }

  function render_confirm_default(): Rendered {
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
                  set_confirm_default(false);
                  if (props.set_as_default != null) props.set_as_default();
                }}
                bsStyle="warning"
              >
                <Icon name="trash" /> Set to Default
              </Button>
              <Button onClick={() => set_confirm_default(false)}>Cancel</Button>
            </ButtonToolbar>
          </Col>
        </Row>
      </Alert>
    );
  }

  function render_confirm_delete(): Rendered {
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
                  set_confirm_delete(false);
                  if (props.delete_method != null) props.delete_method();
                }}
              >
                <Icon name="trash" /> Delete Payment Method
              </Button>
              <Button onClick={() => set_confirm_delete(false)}>Cancel</Button>
            </ButtonToolbar>
          </Col>
        </Row>
      </Alert>
    );
  }

  function render_card(): Rendered {
    return (
      <Row>
        <Col md={2}>
          <Icon name={icon_name()} /> {props.source.brand}
        </Col>
        <Col md={1}>
          <em>····</em>
          {props.source.last4}
        </Col>
        <Col md={1}>
          {props.source.exp_month}/{props.source.exp_year}
        </Col>
        <Col md={2}>{props.source.name}</Col>
        <Col md={1}>{props.source.address_country}</Col>
        <Col md={2}>
          {props.source.address_state}
          <Space />
          <Space />
          {props.source.address_zip}
        </Col>
        {props.set_as_default != null || props.delete_method != null
          ? render_action_buttons()
          : undefined}
      </Row>
    );
  }

  function render_action_buttons(): Rendered {
    return (
      <Col md={3}>
        <ButtonToolbar style={{ float: "right" }}>
          {props.set_as_default != null ? (
            <Button
              onClick={() => set_confirm_default(true)}
              disabled={props.default}
              bsStyle={props.default ? "primary" : "default"}
            >
              Default{!props.default ? <span>... </span> : undefined}
            </Button>
          ) : undefined}

          {props.delete_method != null ? (
            <Button onClick={() => set_confirm_delete(true)}>
              <Icon name="trash" /> Delete
            </Button>
          ) : undefined}
        </ButtonToolbar>
      </Col>
    );
  }

  return (
    <div
      style={{
        borderBottom: "1px solid #999",
        paddingTop: "5px",
        paddingBottom: "5px",
      }}
    >
      {render_card()}
      {confirm_default ? render_confirm_default() : undefined}
      {confirm_delete ? render_confirm_delete() : undefined}
    </div>
  );
};
