/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect, useMemo, useState } from "react";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Alert, Button, Card, Divider, Layout, Space, Table } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import Loading from "components/share/loading";
import TimeAgo from "timeago-react";
import apiPost from "lib/api/post";
import Avatar from "components/account/avatar";
import type { VoucherCode } from "@cocalc/util/db-schema/vouchers";
import Copyable from "components/misc/copyable";

const COLUMNS = [
  {
    title: "Voucher Code",
    dataIndex: "code",
    key: "code",
  },
  {
    title: "When Redeemed",
    dataIndex: "when_redeemed",
    key: "when_redeemed",
    align: "center",
    render: (_, { when_redeemed }) => (
      <>{when_redeemed == null ? "-" : <TimeAgo datetime={when_redeemed} />}</>
    ),
  },
  {
    title: "When Active",
    dataIndex: "active",
    key: "active",
    align: "center",
    render: (_, { active }) => (
      <>{active == null ? "-" : <TimeAgo datetime={active} />}</>
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
    title: "Redeemed By",
    dataIndex: "redeemed_by",
    key: "redeemed_by",
    align: "center",
    render: (_, { redeemed_by }) => (
      <>{redeemed_by ? <Avatar account_id={redeemed_by} /> : undefined}</>
    ),
  },
] as any;

export default function VoucherCodes({ customize, id }) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<VoucherCode[] | null>(null);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const { codes } = await apiPost("/vouchers/get-voucher-codes", { id });
        console.log("codes = ", codes);
        setData(codes);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allCodes = useMemo(() => {
    if (!data) return [];
    return data.map((x) => x.code);
  }, [data]);

  const unusedCodes = useMemo(() => {
    if (!data) return [];
    return data.filter((x) => !x.when_redeemed).map((x) => x.code);
  }, [data]);

  const usedCodes = useMemo(() => {
    if (!data) return [];
    return data.filter((x) => !!x.when_redeemed).map((x) => x.code);
  }, [data]);

  return (
    <Customize value={customize}>
      <Head title={`Voucher With id=${id}`} />
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
            <Card style={{ background: "#fafafa" }}>
              <Space direction="vertical" align="center">
                <A href="/vouchers">
                  <Icon name="gift2" style={{ fontSize: "75px" }} />
                </A>
                <h1>Voucher: id={id}</h1>
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
                {!loading && data && (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        marginBottom: "15px",
                      }}
                    >
                      <Space direction="vertical">
                        <Space>
                          <div style={{ width: "200px" }}>
                            Copy All Codes {`(${allCodes.length})`}
                          </div>
                          <Copyable
                            value={allCodes.join(", ")}
                            inputWidth={"200px"}
                          />
                        </Space>
                        <Space>
                          <div style={{ width: "200px" }}>
                            Copy Unused Codes {`(${unusedCodes.length})`}
                          </div>
                          <Copyable
                            value={unusedCodes.join(", ")}
                            inputWidth={"200px"}
                          />
                        </Space>
                        <Space>
                          <div style={{ width: "200px" }}>
                            Copy Redeemed Codes {`(${usedCodes.length})`}
                          </div>
                          <Copyable
                            value={usedCodes.join(", ")}
                            inputWidth={"200px"}
                          />
                        </Space>
                        <Space>
                          <div style={{ width: "200px" }}>
                            Export full table to CSV
                          </div>
                          <Button>
                            <Icon name="csv" /> Export
                          </Button>
                        </Space>
                      </Space>
                    </div>

                    <Table
                      columns={COLUMNS}
                      dataSource={data}
                      rowKey="code"
                      pagination={{ defaultPageSize: 50 }}
                    />
                  </div>
                )}
                {!loading && data?.length == 0 && (
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
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const { id } = context.params;
  return await withCustomize({ context, props: { id } });
}
