/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Icon } from "@cocalc/frontend/components/icon";
import { Paragraph } from "components/misc";
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
                a convenient way to share and resell <SiteName /> licenses. You
                can <A href="/redeem">redeem a voucher</A>, see{" "}
                <A href="/vouchers/redeemed">the vouchers you have redeemed</A>,
                browse and download{" "}
                <A href="/vouchers/created">vouchers you have created</A>, and
                create or purchase <A href="/store/vouchers">new vouchers</A>.
              </div>
            </div>
            <OverviewRow>
              <Product icon="gift2" title="Redeem a Voucher" href="/redeem">
                Redeem a voucher code that you or somebody else created for one
                or more licenses.
              </Product>
              <Product
                icon="table"
                title="Vouchers You Redeemed"
                href="/vouchers/redeemed"
              >
                See a list of all vouchers you have redeemed, their status, and
                links to the corresponding licenses.
              </Product>
              <Product
                href={"/vouchers/created"}
                icon="csv"
                title="Your Vouchers"
              >
                Browse all vouchers you have created, see their status, and
                exports your vouchers to CSV or JSON.
              </Product>
              <Product
                href={"/store/site-license"}
                icon="shopping-cart"
                title="Create New Vouchers"
              >
                Add licenses with a range of time to your cart, then create
                voucher codes that you can share, resell, or use later. These
                can be redeemed for the contents of your cart, with dates
                shifted to when the voucher is redeemed.
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
            <Paragraph>
              You can also{" "}
              <A href="/store">visit the store to buy licenses directly</A>,
              browse your <A href="/billing">billing records</A> and see the
              status of your <A href="/licenses">licenses</A>.
            </Paragraph>
          </div>
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
