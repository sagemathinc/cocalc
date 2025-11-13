/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useMemo } from "react";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Alert, Card, Layout, Space, Table } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import useProfile from "lib/hooks/profile";
import { useRouter } from "next/router";
import Loading from "components/share/loading";
import useDatabase from "lib/hooks/database";
import TimeAgo from "timeago-react";
import { field_cmp, plural } from "@cocalc/util/misc";
import { r_join } from "@cocalc/frontend/components/r_join";
import License from "components/licenses/license";
import Help from "components/vouchers/help";

const VOUCHER_CODES_QUERY = {
  voucher_codes: [
    {
      code: null,
      id: null,
      when_redeemed: null,
      canceled: null,
      license_ids: null,
      purchase_ids: null,
    },
  ],
} as const;

const COLUMNS = [
  {
    title: "Code",
    dataIndex: "code",
    key: "code",
  },
  {
    title: "When Redeemed",
    dataIndex: "when_redeemed",
    key: "when_redeemed",
    render: (_, { when_redeemed }) => (
      <>
        <TimeAgo datetime={when_redeemed} />
      </>
    ),
  },
  {
    title: "Canceled",
    dataIndex: "canceled",
    key: "canceled",
    align: "center",
    render: (_, { canceled }) => (canceled ? "Yes" : "-"),
  },
  {
    title: "Licenses",
    dataIndex: "license_ids",
    key: "license_ids",
    render: (_, { license_ids }) => {
      if (!license_ids || license_ids.length == 0) return null;
      return r_join(
        license_ids.map((license_id) => (
          <License key={license_id} license_id={license_id} />
        ))
      );
    },
  },
  {
    title: "Credits to Account",
    dataIndex: "purchase_ids",
    key: "purchase_ids",
    render: (_, { purchase_ids }) => {
      if (!purchase_ids || purchase_ids.length == 0) return null;
      return (
        <div>
          <A href="/settings/purchases" external>
            {plural(purchase_ids.length, "Transaction Id")}:{" "}
            {purchase_ids.join(", ")}
          </A>
        </div>
      );
    },
  },
] as any;

export default function Redeemed({ customize }) {
  const { loading, value, error, setError } = useDatabase(VOUCHER_CODES_QUERY);
  const profile = useProfile({ noCache: true });
  const router = useRouter();
  const data = useMemo(() => {
    const cmp = field_cmp("when_redeemed");
    return (value?.voucher_codes ?? []).sort((a, b) => -cmp(a, b));
  }, [value]);

  return (
    <Customize value={customize}>
      <Head title="Vouchers You Redeemed" />
      <Layout>
        <Header />
        <Layout.Content style={{ background: "white" }}>
          <div
            style={{
              width: "100%",
              margin: "10vh 0",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {profile == null && <Loading />}
            {profile != null && !profile.account_id && (
              <Card>
                <div style={{ fontSize: "75px", textAlign: "center" }}>
                  <Icon name="gift2"/>
                </div>
                <InPlaceSignInOrUp
                  title="Redeemed Vouchers"
                  why="to see vouchers you've redeemed"
                  style={{ width: "450px" }}
                  onSuccess={() => {
                    router.reload();
                  }}
                />
              </Card>
            )}
            {profile?.account_id && (
              <Card style={{ background: "#fafafa" }}>
                <Space direction="vertical" align="center">
                  <A href="/vouchers">
                    <Icon name="gift2" style={{ fontSize: "75px" }} />
                  </A>
                  <h1>Vouchers You Redeemed</h1>
                  {error && (
                    <Alert
                      type="error"
                      message={error}
                      showIcon
                      style={{ width: "100%", marginBottom: "30px" }}
                      closable
                      onClose={() => setError("")}
                    />
                  )}
                  {loading && <Loading />}
                  {!loading && data.length > 0 && (
                    <Table
                      columns={COLUMNS}
                      dataSource={data}
                      rowKey="code"
                      pagination={{ defaultPageSize: 50 }}
                    />
                  )}
                  {!loading && data.length == 0 && (
                    <div>
                      You have not <A href="/redeem">redeemed any vouchers</A>{" "}
                      yet.
                    </div>
                  )}
                  <Help />
                </Space>
              </Card>
            )}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
