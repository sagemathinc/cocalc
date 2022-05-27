/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useActions, useTypedRedux } from "../app-framework";
import { Button, Col, Row, Panel } from "../antd-bootstrap";
import { Icon, Space } from "../components";
import { Subscription } from "./subscription";
import { Customer } from "./types";
import { PurchaseOneLicense } from "../site-licenses/purchase";
import { AboutLicenses } from "../account/licenses/about-licenses";

interface Props {
  customer?: Customer;
}

export const SubscriptionList: React.FC<Props> = ({ customer }) => {
  const state = useTypedRedux("billing", "subscription_list_state") ?? "view";
  function set_state(subscription_list_state) {
    actions.setState({ subscription_list_state });
  }
  const actions = useActions("billing");

  function render_buy_license_button(): JSX.Element {
    return (
      <Button
        bsStyle="primary"
        disabled={state != "view"}
        onClick={() => set_state("buy_license")}
      >
        <Icon name="plus-circle" /> Buy a License...
      </Button>
    );
  }

  function render_buy_license(): JSX.Element {
    return (
      <div>
        <div style={{ fontSize: "11pt" }}>
          <AboutLicenses />
        </div>
        <br />
        <PurchaseOneLicense
          onClose={() => {
            set_state("view");
          }}
        />
      </div>
    );
  }

  function render_buy_upgrades_button(): JSX.Element {
    return (
      <Button bsStyle="primary" disabled={true}>
        <Icon name="plus-circle" /> Buy Upgrades (deprecated)...
      </Button>
    );
  }

  function render_buy_upgrades(): JSX.Element {
    return <div>deprecated</div>;
  }

  function render_header(): JSX.Element {
    return (
      <Row>
        <Col sm={6}>
          <Icon name="list-alt" /> Subscriptions
        </Col>
        <Col sm={6}>
          <div style={{ float: "right" }}>
            {render_buy_license_button()}
            <Space /> {render_buy_upgrades_button()}
          </div>
        </Col>
      </Row>
    );
  }

  function render_subscriptions(): JSX.Element[] | JSX.Element | void {
    if (customer == null || customer.subscriptions == null) {
      return;
    }
    const v: JSX.Element[] = [];
    for (const sub of customer.subscriptions.data) {
      v.push(<Subscription key={sub.id} subscription={sub} />);
    }
    return v;
  }

  return (
    <Panel header={render_header()}>
      {state == "buy_upgrades" && render_buy_upgrades()}
      {state == "buy_license" && render_buy_license()}
      {state != "view" && <hr />}
      {render_subscriptions()}
    </Panel>
  );
};
