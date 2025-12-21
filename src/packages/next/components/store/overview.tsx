/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Divider } from "antd";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { Icon, PAYASYOUGO_ICON } from "@cocalc/frontend/components/icon";
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
  const router = useRouter();
  const { supportVideoCall } = useCustomize();

  // most likely, user will go to the cart next
  useEffect(() => {
    router.prefetch("/store/site-license");
  }, []);

  return (
    <div style={OVERVIEW_STYLE}>
      <Icon style={OVERVIEW_LARGE_ICON} name="shopping-cart" />
      <h2 style={{ marginBottom: "30px" }}>
        Welcome to the <SiteName /> Store!
      </h2>
      <Paragraph style={{ fontSize: "13pt" }}>
        Shop below for <A href="/store/membership">memberships</A>,{" "}
        <A href="/store/site-license">licenses</A>, and{" "}
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
        <Product
          href={"/features/compute-server"}
          icon={PAYASYOUGO_ICON}
          title="Compute Servers"
        >
          Run Jupyter Notebooks and Linux Terminals on GPUs and high-powered CPU
          machines with full admin privileges. Pay as you go.
        </Product>
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
        <A href="/settings/licenses">licenses</A>, and{" "}
        <A href="/vouchers/created">vouchers</A>.
      </Paragraph>
    </div>
  );
}

/*
        <Product icon="rocket" title="License Booster" href="/store/boost">
          Add additional upgrades to an existing and <em>compatible</em>{" "}
          license.
        </Product>
        <Product
          href={"/store/dedicated"}
          icon="save"
          icon2="dedicated"
          title="Dedicated Disk/VM"
        >
          Attach a large dedicated disk for more storage to your project or run
          your project on a dedicated Virtual Machine to harness much more CPU
          and memory.
        </Product>

*/
