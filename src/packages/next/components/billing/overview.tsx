/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
import basePath from "lib/base-path";
import { join } from "path";

export default function Overview() {
  return (
    <div style={OVERVIEW_STYLE}>
      <Icon style={OVERVIEW_LARGE_ICON_MARGIN} name="credit-card" />

      <h2 style={{ marginBottom: "30px" }}>Billing Management</h2>

      <OverviewRow>
        <Product
          icon="calendar"
          title="Subscriptions"
          href="/settings/subscriptions"
          external
        >
          View, Edit or <Text strong>cancel</Text> your subscriptions
        </Product>

        <Product
          icon="list"
          title="Invoices and Receipts"
          href="/billing/receipts"
        >
          View your <Text strong>invoices</Text> and{" "}
          <Text strong>receipts</Text>
        </Product>

        <Product
          icon="edit"
          title="Manage Licenses"
          href={join(basePath, "/settings/licenses")}
          external
        >
          View and manage your licenses and see licensed projects you
          collaborate on
        </Product>

        <Product
          icon="credit-card"
          title="Payment Methods"
          href="/settings/payments-methods"
        >
          Add, remove, or change your <Text strong>credit cards</Text> and other
          payment methods.
        </Product>
      </OverviewRow>

      <p>
        You can also <A href="/store/site-license">buy a license</A> at{" "}
        <A href="/store">the store</A> and browse{" "}
        <A external href="/settings/licenses">
          your existing licenses
        </A>{" "}
        and <A href="/vouchers/redeemed">vouchers you have redeemed</A>.
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
