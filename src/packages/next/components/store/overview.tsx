/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Divider } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import SiteName from "components/share/site-name";
import { useCustomize } from "lib/customize";
import {
  OVERVIEW_LARGE_ICON,
  OVERVIEW_STYLE,
  OverviewRow,
  Product,
} from "lib/styles/layouts";

export default function Overview() {
  const { supportVideoCall } = useCustomize();

  return (
    <div style={OVERVIEW_STYLE}>
      <Icon style={OVERVIEW_LARGE_ICON} name="shopping-cart" />
      <h2 style={{ marginBottom: "30px" }}>
        Welcome to the <SiteName /> Store!
      </h2>
      <Paragraph style={{ fontSize: "13pt" }}>
        Shop below for <A href="/store/membership">memberships</A>,{" "}
        <A href="/store/course">courses</A>, and{" "}
        <A href="/store/vouchers">vouchers</A> or explore{" "}
        <A href="/pricing">all available products and pricing</A>.
      </Paragraph>
      {supportVideoCall ? (
        <Paragraph>
          Not sure what you need?{" "}
          <A href={supportVideoCall}>Book a video call</A> and we'll help you
          decide.
        </Paragraph>
      ) : undefined}
      <OverviewRow>
        <Product icon="user" title="Membership" href="/store/membership">
          Subscribe for a simple membership that upgrades your account.
        </Product>
        <Product icon="graduation-cap" title="Course" href="/store/course">
          Purchase a license for teaching a course.
        </Product>
        <Paragraph style={{ textAlign: "center", width: "100%" }}>
          <Icon name="gift" /> Purchase a <A href={"/vouchers"}>voucher code</A>{" "}
          to make <SiteName /> credit easily available to somebody else.
        </Paragraph>
        <Divider />
        <Product href={"/pricing/onprem"} icon="server" title="On-Premises">
          Self-host <SiteName /> on your own compute resources in order to keep
          your data on-site.
        </Product>
      </OverviewRow>
      <Paragraph style={{ marginTop: "4em" }}>
        If you already selected one or more items, view your{" "}
        <A href="/store/cart">shopping cart</A> or go straight to{" "}
        <A href="/store/checkout">checkout</A>.
      </Paragraph>
      <Paragraph style={{ marginBottom: "4em" }}>
        You can also browse your{" "}
        <A href="/settings/purchases">purchase history</A>,{" "}
        <A href="/settings/licenses">software licenses</A>, and{" "}
        <A href="/vouchers/created">vouchers</A>.
      </Paragraph>
    </div>
  );
}
