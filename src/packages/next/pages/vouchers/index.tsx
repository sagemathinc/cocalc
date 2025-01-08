/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import SiteName from "components/share/site-name";
import {
  OverviewRow,
  OVERVIEW_LARGE_ICON,
  OVERVIEW_STYLE,
  Product,
} from "lib/styles/layouts";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import useProfile from "lib/hooks/profile";

export default function Overview({ customize }) {
  const profile = useProfile();
  return (
    <Customize value={customize}>
      <Head title="Voucher Center" />
      <Layout>
        <Header />
        <Layout.Content style={{ background: "white" }}>
          <div style={OVERVIEW_STYLE}>
            <Icon style={OVERVIEW_LARGE_ICON} name="gift" />
            <h2 style={{ marginBottom: "30px" }}>
              Welcome to the <SiteName /> Voucher Center!
            </h2>
            <div style={{ fontSize: "12pt" }}>
              <div style={{ maxWidth: "700px", margin: "auto" }}>
                <A href="https://doc.cocalc.com/vouchers.html">Vouchers</A> are
                like a digital gift card, which can be used to purchase anything
                on <SiteName />.
              </div>
            </div>
            <OverviewRow>
              <Product
                href={"/store/vouchers"}
                icon="shopping-cart"
                title="Buy Vouchers"
              >
                Create voucher codes that you can share, resell, or use later.
              </Product>
              <Product icon="gift2" title="Redeem a Voucher" href="/redeem">
                Redeem a voucher code to add{" "}
                <A href="/settings/purchases">money</A> to your account.
              </Product>
              <Product
                icon="table"
                title="Vouchers You Redeemed"
                href="/vouchers/redeemed"
              >
                See a list of all vouchers you have redeemed.
              </Product>
              <Product
                href={"/vouchers/created"}
                icon="csv"
                title="Your Vouchers"
              >
                Browse all vouchers you have created and see their status.
              </Product>
            </OverviewRow>
            {profile?.is_admin && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: "30px",
                }}
              >
                <Product
                  href={"/vouchers/admin"}
                  icon="users"
                  title="Admin -- Voucher Payment Status"
                >
                  See the status of all vouchers that users have created.{" "}
                  <b>This page is only available to site admins.</b>
                </Product>
              </div>
            )}
          </div>
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
