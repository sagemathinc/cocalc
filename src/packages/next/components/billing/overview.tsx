/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { Typography } from "antd";
import A from "components/misc/A";
import {
  OverviewRow,
  OVERVIEW_LARGE_ICON_MARGIN,
  OVERVIEW_STYLE,
  Product,
} from "lib/styles/layouts";
const { Text } = Typography;

export default function Overview() {
  return (
    <div style={OVERVIEW_STYLE}>
      <Icon style={OVERVIEW_LARGE_ICON_MARGIN} name="credit-card" />

      <h2 style={{ marginBottom: "30px" }}>Billing Management</h2>

      <OverviewRow>
        <Product
          icon="credit-card"
          title="Payment Methods"
          href="/billing/cards"
        >
          Add, remove, or change your <Text strong>credit cards</Text>.
        </Product>

        <Product
          icon="calendar"
          title="Subscriptions"
          href="/billing/subscriptions"
        >
          View or <Text strong>cancel</Text> your subscriptions
        </Product>

        <Product
          icon="list"
          title="Invoices and Receipts"
          href="/billing/receipts"
        >
          View your <Text strong>invoices</Text> and{" "}
          <Text strong>receipts</Text>
        </Product>

        <Product icon="key" title="Manage Licenses" href="/licenses/managed">
          View and manage your licenses
          <br />
          <Text type="secondary">
            (in <A href={"/licenses"}>Licenses</A>)
          </Text>
        </Product>
      </OverviewRow>

      <p>
        You can also <A href="/store/site-license">buy a license</A> at{" "}
        <A href="/store">the store</A> and{" "}
        <A href="/licenses/managed">browse your existing licenses</A>.
      </p>
      <p>
        More general, you can also read{" "}
        <A href="https://doc.cocalc.com/account/purchases.html#subscription-list">
          the billing documentation
        </A>
        .
      </p>
    </div>
  );
}
