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
import { field_cmp } from "@cocalc/util/misc";
import { money } from "@cocalc/util/licenses/purchase/utils";
import Help from "components/vouchers/help";

const QUERY = {
  vouchers: [
    {
      id: null,
      created: null,
      active: null,
      expire: null,
      title: null,
      count: null,
      cost: null,
      tax: null,
      when_pay: null,
      purchased: null,
    },
  ],
} as const;

export const COLUMNS = [
  {
    title: "ID",
    dataIndex: "id",
    key: "id",
  },
  {
    title: "Created",
    dataIndex: "created",
    key: "created",
    render: (_, { id, created }) => (
      <A href={`/vouchers/${id}`}>{<TimeAgo datetime={created} />}</A>
    ),
  },
  {
    title: (
      <>
        Codes
        <br />
        (click to view)
      </>
    ),
    dataIndex: "count",
    key: "count",
    align: "center",
    render: (_, { id, count }) => <A href={`/vouchers/${id}`}>{count}</A>,
  },

  {
    title: "Cost",
    dataIndex: "cost",
    key: "cost",
    align: "center",
    render: (_, { id, cost, tax }) => (
      <A href={`/vouchers/${id}`}>
        {money(cost, true)}
        {tax ? ` (+ ${money(tax, true)} tax)` : ""} each
      </A>
    ),
  },
  {
    title: "Status",
    render: (_, { id, when_pay, purchased }) => (
      <A href={`/vouchers/${id}`}>
        <Status when_pay={when_pay} purchased={purchased} />
      </A>
    ),
  },
  {
    title: "Description",
    dataIndex: "title",
    key: "title",
    render: (_, { title, id }) => {
      return <A href={`/vouchers/${id}`}>{title}</A>;
    },
  },
  {
    title: "Active",
    dataIndex: "active",
    key: "active",
    align: "center",
    render: (_, { id, active }) => (
      <A href={`/vouchers/${id}`}>
        <TimeAgo datetime={active} />
      </A>
    ),
  },
  {
    title: "Expire",
    dataIndex: "expire",
    key: "expire",
    align: "center",
    render: (_, { id, expire }) => {
      return expire ? (
        <A href={`/vouchers/${id}`}>
          <TimeAgo datetime={expire} />
        </A>
      ) : (
        "never"
      );
    },
  },
] as any;

export default function Created({ customize }) {
  const { loading, value, error, setError } = useDatabase(QUERY);
  const profile = useProfile({ noCache: true });
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
                  <Icon name="gift2" />
                </div>
                <InPlaceSignInOrUp
                  title="Created Vouchers"
                  why="to see vouchers you've created"
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
                  <h1>Your Vouchers ({data.length})</h1>
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

function Status({ when_pay, purchased }) {
  if (when_pay == "now") {
    return <>Paid</>;
  }
  if (when_pay == "invoice") {
    return purchased?.time ? (
      <>
        Paid <TimeAgo datetime={purchased.time} />
      </>
    ) : (
      <>Invoice at Expiration</>
    );
  }
  if (when_pay == "admin") {
    return <>Admin (free)</>;
  }
  return null;
}
