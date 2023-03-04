/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useMemo } from "react";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Alert, Card, Divider, Layout, Space, Table } from "antd";
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
import { field_cmp } from "@cocalc/util/misc";
//import { r_join } from "@cocalc/frontend/components/r_join";
import { money } from "@cocalc/util/licenses/purchase/utils";

const QUERY = {
  vouchers: [
    {
      id: null,
      created: null,
      active: null,
      expire: null,
      cancel_by: null,
      title: null,
      count: null,
      cost: null,
      tax: null,
      cart: null,
      when_pay: null,
    },
  ],
} as const;

const COLUMNS = [
  {
    title: "ID",
    dataIndex: "id",
    key: "id",
  },
  {
    title: "Created",
    dataIndex: "created",
    key: "created",
    render: (_, { created }) => <TimeAgo datetime={created} />,
  },
  {
    title: "Count",
    dataIndex: "count",
    key: "count",
    align: "center",
    render: (_, { count }) => count,
  },

  {
    title: "Cost",
    dataIndex: "cost",
    key: "cost",
    align: "center",
    render: (_, { cost, tax }) => (
      <>
        {money(cost, true)}
        {tax ? ` (+ ${money(tax, true)} tax)` : ""} per voucher
      </>
    ),
  },
  {
    title: "Status",
    render: (_, { when_pay }) => {
      if (when_pay == "now") {
        return "Paid";
      }
      if (when_pay == "invoice") {
        return "Invoice at Expiration";
      }
      if (when_pay == "admin") {
        return "Admin (free)";
      }
    },
  },
  {
    title: "Description",
    dataIndex: "title",
    key: "title",
    render: (_, { title }) => {
      return title;
    },
  },
  {
    title: "Active",
    dataIndex: "active",
    key: "active",
    align: "center",
    render: (_, { active }) => <TimeAgo datetime={active} />,
  },
  {
    title: "Expire",
    dataIndex: "expire",
    key: "expire",
    align: "center",
    render: (_, { expire }) => <TimeAgo datetime={expire} />,
  },
  {
    title: "Cancel By",
    dataIndex: "cancel_by",
    key: "cancel_by",
    align: "center",
    render: (_, { cancel_by }) => <TimeAgo datetime={cancel_by} />,
  },
] as any;

export default function Created({ customize }) {
  const { loading, value, error, setError } = useDatabase(QUERY);
  const { account_id } = useProfile({ noCache: true }) ?? {};
  const router = useRouter();
  const data = useMemo(() => {
    const cmp = field_cmp("created");
    return (value?.vouchers ?? []).sort((a, b) => -cmp(a, b));
  }, [value]);

  return (
    <Customize value={customize}>
      <Head title="Your Vouchers" />
      <Layout>
        <Header />
        <Layout.Content>
          <div
            style={{
              width: "100%",
              margin: "10vh 0",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {!account_id && (
              <Card style={{ textAlign: "center" }}>
                <Icon name="gift2" style={{ fontSize: "75px" }} />
                <InPlaceSignInOrUp
                  why="to see your vouchers"
                  style={{ fontSize: "14pt", width: "450px" }}
                  onSuccess={() => {
                    router.reload();
                  }}
                />
              </Card>
            )}
            {account_id && (
              <Card style={{ background: "#fafafa" }}>
                <Space direction="vertical" align="center">
                  <A href="/vouchers">
                    <Icon name="gift2" style={{ fontSize: "75px" }} />
                  </A>
                  <h1>Your Vouchers</h1>
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
                      rowKey="id"
                      pagination={{ defaultPageSize: 50 }}
                    />
                  )}
                  {!loading && data.length == 0 && (
                    <div>
                      You have not <A href="/redeem">redeemed any vouchers</A>{" "}
                      yet.
                    </div>
                  )}
                  <Divider orientation="left" style={{ width: "600px" }}>
                    Vouchers
                  </Divider>
                  <div
                    style={{
                      color: "#666",
                      maxWidth: "600px",
                    }}
                  >
                    When you <A href="/redeem">redeem</A> a{" "}
                    <A href="/store/vouchers">voucher</A>, one or more{" "}
                    <A href="https://doc.cocalc.com/licenses.html">licenses</A>{" "}
                    will be added to your account. You can use{" "}
                    <A href="/licenses/managed">licenses</A> to{" "}
                    <A href="https://doc.cocalc.com/add-lic-project.html">
                      upgrade your projects
                    </A>
                    . If you have any questions,{" "}
                    <A href="/support">contact support</A> or visit{" "}
                    <A href="/vouchers">the Voucher Center</A>.
                  </div>
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
