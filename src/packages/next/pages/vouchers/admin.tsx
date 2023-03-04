/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useCallback, useMemo, useState } from "react";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Layout,
  Space,
  Table,
} from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import useProfile from "lib/hooks/profile";
import { useRouter } from "next/router";
import Loading from "components/share/loading";
import useDatabase from "lib/hooks/database";
import { field_cmp } from "@cocalc/util/misc";
import type { Voucher } from "@cocalc/util/db-schema/vouchers";

const QUERY = {
  crm_vouchers: [
    {
      id: null,
      when_pay: null,
      created: null,
      active: null,
      expire: null,
      cancel_by: null,
      title: null,
      count: null,
      cost: null,
      tax: null,
      cart: null,
      purchased: null,
    },
  ],
} as const;

import { COLUMNS as COLUMNS0 } from "./created";
const COLUMNS = COLUMNS0.concat([
  {
    title: "When Pay",
    dataIndex: "when_pay",
    key: "when_pay",
  },
  {
    title: "Purchased",
    dataIndex: "purchased",
    key: "purchased",
    render: (_, { purchased }) => <pre>{JSON.stringify(purchased)}</pre>,
  },
]);

export default function Created({ customize }) {
  const { loading, value, error, setError } = useDatabase(QUERY);
  const profile = useProfile({ noCache: true });
  const router = useRouter();
  const [showUnpaidOnly, setShowUnpaidOnly] = useState<boolean>(false);
  const [showExpiredOnly, setShowExpiredOnly] = useState<boolean>(false);
  const [showAdminOnly, setShowAdminOnly] = useState<boolean>(false);
  const [showPaidOnly, setShowPaidOnly] = useState<boolean>(false);

  const data: Voucher[] = useMemo(() => {
    const cmp = field_cmp("created");
    let v: Voucher[] = (value?.crm_vouchers ?? []).sort((a, b) => -cmp(a, b));
    if (showUnpaidOnly) {
      v = v.filter((x) => x.when_pay == "invoice" && x.purchased == null);
    }
    if (showExpiredOnly) {
      const now = new Date();
      v = v.filter((x) => new Date(x.expire) <= now);
    }
    if (showPaidOnly) {
      v = v.filter((x) => x.purchased != null);
    }
    if (showAdminOnly) {
      v = v.filter((x) => x.when_pay == "admin");
    }

    return v;
  }, [value, showUnpaidOnly, showExpiredOnly, showPaidOnly, showAdminOnly]);

  const doInvoiceUnpaid = useCallback(() => {
    console.log("doInvoiceUnpaid");
  }, []);

  return (
    <Customize value={customize}>
      <Head title="Admin: Voucher Payment Status" />
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
              <Card style={{ textAlign: "center" }}>
                <Icon name="gift2" style={{ fontSize: "75px" }} />
                <InPlaceSignInOrUp
                  why="as an ADMIN to see voucher payment status"
                  style={{ fontSize: "14pt", width: "450px" }}
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
                  <h1>
                    <Icon name="users" /> Admin -- Voucher Payment Status (
                    {data.length})
                  </h1>
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
                  {!loading && (
                    <div>
                      <Checkbox
                        checked={showUnpaidOnly}
                        onClick={() => setShowUnpaidOnly(!showUnpaidOnly)}
                      >
                        Show unpaid only
                      </Checkbox>
                      <Checkbox
                        checked={showExpiredOnly}
                        onClick={() => setShowExpiredOnly(!showExpiredOnly)}
                      >
                        Show expired only
                      </Checkbox>
                      <Checkbox
                        checked={showAdminOnly}
                        onClick={() => setShowAdminOnly(!showAdminOnly)}
                      >
                        Show admin only
                      </Checkbox>
                      <Checkbox
                        checked={showPaidOnly}
                        onClick={() => setShowPaidOnly(!showPaidOnly)}
                      >
                        Show paid only
                      </Checkbox>
                    </div>
                  )}
                  {!loading && showUnpaidOnly && showExpiredOnly && (
                    <div>
                      <Button
                        type="primary"
                        onClick={doInvoiceUnpaid}
                        disabled={data.length == 0}
                      >
                        Create Invoices and Charge for the {data.length} Unpaid
                        Vouchers
                      </Button>
                    </div>
                  )}
                  {!loading && data.length > 0 && (
                    <Table
                      columns={COLUMNS}
                      dataSource={data}
                      rowKey="id"
                      pagination={{ defaultPageSize: 50 }}
                    />
                  )}
                  {!loading && data.length == 0 && (
                    <div>There are no matching vouchers.</div>
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
