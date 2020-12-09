/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "../app-framework";
import { visit_billing_page } from "../billing/billing-page-link";
import { Alert, Button } from "../antd-bootstrap";
import { Icon } from "./icon";

export const UPGRADE_ERROR_STYLE = {
  color: "white",
  background: "red",
  padding: "1ex",
  borderRadius: "3px",
  fontWeight: "bold",
  marginBottom: "1em",
} as CSS;

interface Props {
  cancel: () => void;
}

export const NoUpgrades: React.FC<Props> = ({ cancel }) => {
  function billing(e): void {
    e.preventDefault();
    visit_billing_page();
  }

  return (
    <Alert bsStyle="info">
      <h3>
        <Icon name="exclamation-triangle" /> Your account has no upgrades
        available
      </h3>
      <p>You can purchase upgrades starting at $14 / month.</p>
      <p>
        <a href="" onClick={billing}>
          Visit the billing page...
        </a>
      </p>
      <Button onClick={cancel}>Cancel</Button>
    </Alert>
  );
};
