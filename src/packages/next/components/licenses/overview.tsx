/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { WORKSPACES_LABEL } from "@cocalc/util/i18n/terminology";
import A from "components/misc/A";
import {
  OverviewRow,
  OVERVIEW_LARGE_ICON_MARGIN,
  OVERVIEW_STYLE,
  Product,
} from "lib/styles/layouts";
import useCustomize from "lib/use-customize";
import basePath from "lib/base-path";
import { join } from "path";

export default function Overview() {
  const { isCommercial } = useCustomize();
  return (
    <div style={OVERVIEW_STYLE}>
      <Icon style={OVERVIEW_LARGE_ICON_MARGIN} name="key" />

      <h2 style={{ marginBottom: "30px" }}>License management</h2>

      <OverviewRow>
        <Product
          icon="edit"
          title="Manage Licenses"
          href={join(basePath, "/settings/licenses")}
          external
        >
          View and manage your licenses and see licensed{" "}
          {WORKSPACES_LABEL.toLowerCase()} you collaborate on
        </Product>

        <Product icon="rocket" href="/licenses/how-used" title="License Usage">
          See how a specific license is being used
        </Product>

        {isCommercial && (
          <Product
            icon="ban"
            title="Cancel Subscription"
            href={join(basePath, "/settings/subscriptions")}
            external
          >
            Cancel an ongoing subscription
          </Product>
        )}
      </OverviewRow>

      {isCommercial && (
        <p>
          You can also <A href="/store/site-license">buy a license</A>,{" "}
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
