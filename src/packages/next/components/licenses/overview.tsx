/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
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
import useCustomize from "lib/use-customize";
const { Text } = Typography;

export default function Overview() {
  const { isCommercial } = useCustomize();
  return (
    <div style={OVERVIEW_STYLE}>
      <Icon style={OVERVIEW_LARGE_ICON_MARGIN} name="key" />

      <h2 style={{ marginBottom: "30px" }}>License management</h2>

      <OverviewRow>
        <Product icon="key" title="Manage licenses" href="/licenses/managed">
          View and manage your licenses
        </Product>

        <Product
          icon="edit"
          href="/licenses/projects"
          title="Licensed projects"
        >
          Browse licensed projects you collaborate on
        </Product>

        <Product icon="rocket" href="/licenses/how-used" title="How used">
          See how a specific site license is being used
        </Product>

        {isCommercial && (
          <Product
            icon="ban"
            title="Cancel subscription"
            href="/billing/subscriptions"
          >
            Cancel an ongoing subscription
            <br />
            <Text type="secondary">
              (in <A href={"/billing"}>Billing</A>)
            </Text>
          </Product>
        )}
      </OverviewRow>

      {isCommercial && (
        <p>
          You can also <A href="/store/site-license">buy a site license</A>,{" "}
          <A href="/billing/subscriptions">
            manage your purchased subscriptions
          </A>{" "}
          or browse <A href="/billing/receipts">your receipts and invoices</A>.
        </p>
      )}
      <p>
        More general, you can also read{" "}
        <A href="https://doc.cocalc.com/licenses.html">
          the license documentation
        </A>
        .
      </p>
    </div>
  );
}
