/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered, useActions, useState } from "../app-framework";
import { Button, Row, Col } from "../antd-bootstrap";
const { Panel } = require("react-bootstrap"); // since the typescript declarations are our of sync with our crappy old version.
import { Icon } from "../r_misc/icon";

import { Source } from "./types";

import { AddPaymentMethod } from "./add-payment-method";
import { PaymentMethod } from "./payment-method";
import { ErrorDisplay } from "../r_misc/error-display";

import { cmp } from "smc-util/misc2";

interface Props {
  sources?: { data: Source[] }; // could be undefined, if it is a customer and all sources are removed
  default?: string;
}

type State = "view" | "delete" | "add_new";

export const PaymentMethods: React.FC<Props> = (props) => {
  const [state, set_state] = useState<State>("view");
  const [error, set_error] = useState<string>("");
  const actions = useActions("billing");

  function add_payment_method(): void {
    set_state("add_new");
  }

  function render_add_payment_method(): Rendered {
    if (state === "add_new") {
      return <AddPaymentMethod on_close={() => set_state("view")} />;
    }
  }

  function render_add_payment_method_button(): Rendered {
    return (
      <Button
        disabled={state !== "view"}
        onClick={add_payment_method}
        bsStyle="primary"
        className="pull-right"
      >
        <Icon name="plus-circle" /> Add payment method...
      </Button>
    );
  }

  function render_header(): Rendered {
    return (
      <Row>
        <Col sm={6}>
          <Icon name="credit-card" /> Payment methods
        </Col>
        <Col sm={6}>{render_add_payment_method_button()}</Col>
      </Row>
    );
  }

  function set_as_default(id: string): void {
    actions.set_as_default_payment_method(id);
  }

  function delete_method(id: string): void {
    actions.delete_payment_method(id);
  }

  function render_payment_method(source: Source): Rendered {
    if (source.object != "card") {
      // TODO: non credit cards not yet supported.
      // These *do* arise naturally already in cocalc, e.g., when you pay via
      // for an invoice with a failing payment directly on the stripe page
      // for your invoice.
      return;
    }
    return (
      <PaymentMethod
        key={source.id}
        source={source}
        default={source.id === props.default}
        set_as_default={() => set_as_default(source.id)}
        delete_method={() => delete_method(source.id)}
      />
    );
  }

  function render_payment_methods(): undefined | Rendered[] {
    // this happens, when it is a customer but all credit cards are deleted!
    if (props.sources == null) {
      return;
    }
    // Always sort sources in the same order.  This way when you select
    // a default source, they don't get reordered, which is really confusing.
    props.sources.data.sort((a, b) => cmp(a.id, b.id));
    return props.sources.data.map((source) => render_payment_method(source));
  }

  function render_error(): Rendered {
    if (error) {
      return <ErrorDisplay error={error} onClose={() => set_error("")} />;
    }
  }

  return (
    <Panel header={render_header()}>
      {render_error()}
      {state == "add_new" ? render_add_payment_method() : undefined}
      {render_payment_methods()}
    </Panel>
  );
};
